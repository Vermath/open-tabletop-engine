import { visionSenseBypassesAmbientDarkness } from "@open-tabletop/core";
import type { Scene, VisionPolygon, VisionSnapshot } from "@open-tabletop/core";

const points = (polygon: VisionPolygon) => polygon.points.map((point) => `${point.x},${point.y}`).join(" ");

/** SVG composition matches isPointVisibleInSceneVision without exposing unlit map pixels. */
export function DynamicVisibilityMask({ scene, vision }: { scene: Pick<Scene, "id" | "width" | "height">; vision: VisionSnapshot }) {
  const polygons = vision.polygons.filter((polygon) => polygon.points.length >= 3);
  const sight = polygons.filter((polygon) => polygon.source === "token");
  const senses = sight.filter((polygon) => visionSenseBypassesAmbientDarkness(polygon.senseType));
  const lights = polygons.filter((polygon) => polygon.source === "light" && polygon.lightingEffect !== "darkness");
  const darkness = polygons.filter((polygon) => polygon.lightingEffect === "darkness");
  const magicalBypass = senses.filter((polygon) => polygon.senseType !== "darkvision");
  const hidden = polygons.filter((polygon) => polygon.source === "fog" && polygon.mode === "hide");
  const lightClipId = `dynamic-light-${scene.id}`;
  const darknessMaskId = `dynamic-darkness-${scene.id}`;
  const fogMaskId = `dynamic-fog-${scene.id}`;
  const bounds = { x: 0, y: 0, width: scene.width, height: scene.height };
  return <svg className="vision-mask-layer" data-visibility-mode="dynamic" viewBox={`0 0 ${scene.width} ${scene.height}`} aria-hidden="true">
    <defs>
      <clipPath id={lightClipId} clipPathUnits="userSpaceOnUse">
        {lights.map((polygon) => <polygon key={polygon.id} points={points(polygon)} />)}
      </clipPath>
      <mask id={darknessMaskId} maskUnits="userSpaceOnUse" {...bounds}>
        <rect {...bounds} fill="white" />
        {darkness.map((polygon) => <polygon key={polygon.id} points={points(polygon)} fill="black" />)}
        {senses.map((polygon) => <polygon key={polygon.id} points={points(polygon)} fill="white" />)}
        {darkness.filter((polygon) => polygon.magical).map((polygon) => <polygon key={`${polygon.id}-magical`} points={points(polygon)} fill="black" />)}
        {magicalBypass.map((polygon) => <polygon key={`${polygon.id}-bypass`} points={points(polygon)} fill="white" />)}
      </mask>
      <mask id={fogMaskId} maskUnits="userSpaceOnUse" {...bounds}>
        <rect {...bounds} fill="white" />
        <g mask={`url(#${darknessMaskId})`}>
          <g clipPath={`url(#${lightClipId})`}>
            {sight.map((polygon) => <polygon key={polygon.id} points={points(polygon)} fill="black" />)}
          </g>
          {senses.map((polygon) => <polygon key={polygon.id} points={points(polygon)} fill="black" />)}
        </g>
        {hidden.map((polygon) => <polygon key={polygon.id} points={points(polygon)} fill="white" />)}
      </mask>
    </defs>
    <rect {...bounds} fill="#05080c" mask={`url(#${fogMaskId})`} />
  </svg>;
}
