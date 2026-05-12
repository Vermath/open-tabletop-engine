# Troubleshooting

## API Offline

- Confirm the API terminal is running `pnpm --filter @open-tabletop/api dev`.
- Check `GET http://localhost:4000/api/v1/health`.
- Restart the web client after changing `VITE_API_URL`.

## Import Failed

- Confirm the file is JSON and has `format: "ottx"`.
- Supported archive versions are `0.1.0` and `0.2.0`.
- Retry import after exporting a fresh backup.
- File an issue with the redacted Report Bundle if the campaign still opens but import failed.

## Missing Player Content

- Verify the player's campaign role.
- Verify journal or handout visibility.
- Verify the token is not hidden and the actor is owned by that player.

## Content Import Problems

- Preview again if the imported body was malformed.
- Roll back before deleting an applied import.
- Do not paste proprietary source content into GitHub issues; attach the redacted Report Bundle instead.
