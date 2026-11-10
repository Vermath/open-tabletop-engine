// Compile-only conformance: no runtime values are imported or executed.
import type {
  PluginChatCommandInput as SdkInput,
  PluginBridgeContext,
  PluginContext,
  PluginEventEnvelope,
  PluginEventType,
  PluginManifest,
  PluginPermissionName,
  PluginProposalChange,
  PluginTokenMoveBatchEntry,
  PluginTokenMoveBatchRequest,
  PluginChatCommandOutput,
  PluginChatCommandStorageMutation as SdkStorageMutation,
  PluginCommandTokenContext as SdkTokenContext,
  PluginCommandStorageEntry as SdkStorageEntry,
} from "@open-tabletop/plugin-sdk";
import type { EngineEvent, PermissionName, ProposalChange, TokenMoveBatchEntry, TokenMoveBatchRequest } from "@open-tabletop/core";
import type {
  PluginChatCommandInput as ApiInput,
  PluginChatCommandResult as ApiResult,
  PluginChatCommandStorageMutation as ApiStorageMutation,
  PluginCommandTokenContext as ApiTokenContext,
  PluginCommandStorageEntry as ApiStorageEntry,
} from "../src/plugin-runtime.js";

type Assert<T extends true> = T;
type SameShape<A, B> = [A] extends [B]
  ? [B] extends [A] ? true : false
  : false;

// Host permissions are broader; compare the remaining DTO in both directions.
export type InputConformance = Assert<SameShape<Omit<SdkInput, "permissions">, Omit<ApiInput, "permissions">>>;
export type InputKeysConformance = Assert<SameShape<keyof SdkInput, keyof ApiInput>>;
export type TokenConformance = Assert<SameShape<SdkTokenContext, ApiTokenContext>>;
export type StorageEntryConformance = Assert<SameShape<SdkStorageEntry, ApiStorageEntry>>;
export type StorageMutationConformance = Assert<SameShape<SdkStorageMutation, ApiStorageMutation>>;

// API normalization supplies default visibility and adds its own bridge envelope.
type NormalizedAuthorOutput = Omit<PluginChatCommandOutput, "visibility"> & {
  visibility: NonNullable<PluginChatCommandOutput["visibility"]>;
};
type NormalizedApiOutput = Omit<ApiResult, "bridgeRequests">;
export type OutputConformance = Assert<SameShape<NormalizedAuthorOutput, NormalizedApiOutput>>;
export type OutputKeysConformance = Assert<SameShape<keyof NormalizedAuthorOutput, keyof NormalizedApiOutput>>;

type SameKeys<A, B> = SameShape<keyof A, keyof B>;
export type PermissionSubset = Assert<[PluginPermissionName] extends [PermissionName] ? true : false>;
export type InputPermissions = Assert<SameShape<SdkInput["permissions"], PluginPermissionName[]>>;
export type ContextPermissions = Assert<SameShape<PluginContext["permissions"], PluginPermissionName[]>>;
export type ManifestPermissions = Assert<SameShape<PluginManifest["permissions"], PluginPermissionName[]>>;
export type BridgePermissions = Assert<SameShape<PluginBridgeContext["permissions"], readonly PluginPermissionName[]>>;

// Fixed metadata projection: plugins never receive payload or sequence here.
type EventMetadataKeys = "id" | "campaignId" | "type" | "actorUserId" | "targetId" | "timestamp" | "causationId" | "correlationId";
export type EventSubset = Assert<[PluginEventType] extends [EngineEvent["type"]] ? true : false>;
export type EventMetadataKeysConformance = Assert<SameShape<keyof PluginEventEnvelope, EventMetadataKeys>>;
export type EventMetadataConformance = Assert<SameShape<Omit<PluginEventEnvelope, "type">, Pick<EngineEvent, Exclude<EventMetadataKeys, "type">>>>;

// Pin the bridge entity surface independently of SDK-derived host aliases.
type OrdinaryEntity = "campaign" | "world" | "scene" | "token" | "journal" | "handout" | "chat" | "roll" | "diceMacro" | "encounter" | "combat" | "asset" | "fogPreset" | "pluginStorage";
type OrdinarySdkChange = Exclude<PluginProposalChange, { entity: "actor" | "item" }>;
type OrdinaryHostChange = Omit<ProposalChange, "entity"> & { entity: OrdinaryEntity };
type RenameSdkChange = Extract<PluginProposalChange, { entity: "actor" | "item" }>;
type RenameChange = { entity: "actor" | "item"; action: "update"; id: string; data: { name: string } };
export type ProposalSubset = Assert<[PluginProposalChange] extends [ProposalChange] ? true : false>;
export type OrdinaryProposalConformance = Assert<SameShape<OrdinarySdkChange, OrdinaryHostChange>>;
export type OrdinaryProposalKeysConformance = Assert<SameKeys<OrdinarySdkChange, OrdinaryHostChange>>;
export type RenameProposalConformance = Assert<SameShape<RenameSdkChange, RenameChange>>;
export type RenameProposalKeysConformance = Assert<SameKeys<RenameSdkChange, RenameChange>>;
export type MoveEntryConformance = Assert<SameShape<PluginTokenMoveBatchEntry, TokenMoveBatchEntry>>;
export type MoveEntryKeysConformance = Assert<SameKeys<PluginTokenMoveBatchEntry, TokenMoveBatchEntry>>;
export type MoveRequestConformance = Assert<SameShape<PluginTokenMoveBatchRequest, TokenMoveBatchRequest>>;
export type MoveRequestKeysConformance = Assert<SameKeys<PluginTokenMoveBatchRequest, TokenMoveBatchRequest>>;
export type MoveBridgeParameters = Assert<SameShape<Parameters<PluginBridgeContext["moveTokens"]>, [string, TokenMoveBatchRequest]>>;
export type MoveContextParameters = Assert<SameShape<Parameters<PluginContext["moveTokens"]>, [string, TokenMoveBatchRequest]>>;
