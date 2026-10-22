# Same-tab manager restart update

## Apply on your camera computer

1. In your current manager, open **Settings → Quit manager**. Wait a few seconds for it to stop.
2. Extract this update into your **existing MediaMTX Manager folder**. Allow replacement of the included files: **Start Manager.vbs**, **launcher.mjs**, **server.mjs**, and **dist**.
3. Keep the existing **data** and **runtime** folders. This ZIP does not replace either; your cameras, encrypted passwords and recordings stay in place.
4. Double-click the updated **Start Manager.vbs** once. Refresh or close any older manager pages so you use the updated page.

## What changes

- **Quit manager** stops the camera manager, camera streams and recordings, then shows **Start manager** in the same page.
- **Start manager** restarts the background manager and reconnects that existing tab. It does not open another browser window or tab.
- Refreshing the stopped page still works and keeps Start manager available.
- Saved enabled cameras reconnect when the manager restarts. A sample stream you left enabled starts again too. Paused cameras stay paused.
- **Start server / Stop server** remain separate controls for MediaMTX while the manager is open.
- Confirmation messages appear inside the manager instead of in a separate browser prompt.
- Running the launcher again uses the existing instance. A browser page is opened only when no recent open manager page is registered. Closed or crashed pages are removed from the short-lived page registry.

A small local launcher intentionally stays running after Quit manager; that is what keeps the stopped page and its Start button working. It listens only on this computer, does not expose cameras to the internet, and requires a local session token for restart requests. No browser protocol registration, router configuration, administrator access or CMD is needed.

This is a core-manager update. It does not install the future desktop application or change Windows startup settings. Windows sign-out or restart closes the launcher; open Start Manager.vbs after signing back in until the future shortcut/installer is added.
