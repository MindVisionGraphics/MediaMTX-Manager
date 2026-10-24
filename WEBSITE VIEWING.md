> **Custom website integration / development notes:** Website viewing described
> here was developed for MindVision Graphics' own website. It is separate from
> the general manager product and is not a bundled public Watch page offering.

# Website viewing — local preparation

This update adds Settings → Public website viewing and a separate, read-only viewer.
Public Internet access and the MindVision Graphics website link are NOT configured yet.

## Update the camera computer

1. Quit manager in the existing page.
2. Extract the website-viewing update into the existing manager folder, replacing files. Keep data and runtime.
3. Open Start Manager.vbs once, then return to Settings.
4. Choose which cameras visitors may see, enable public viewing, and save.
5. Use Preview public viewer on this computer. Press Watch live to load a camera.

The viewer has its own local address: http://127.0.0.1:17862/watch/.
It deliberately does not expose manager controls, recordings, passwords or camera addresses.
Turning public viewing off, deselecting a camera, or pausing/removing a camera blocks new media requests.
A visitor may still see a few seconds already buffered. Public footage can be copied by viewers.
New cameras are private by default. Camera edits preserve the public-viewing choice.
Quitting the manager stops the viewer too.

## Connect the website

The intended flow is a normal text link under 3D Printing called “See what's printing”.
That link opens the dedicated viewer. The main printing page loads no camera video.
The viewer also waits until the visitor presses Watch live before requesting video.

A production HTTPS video relay / connection is still required between the Internet and the camera computer.
Select it after checking the website host, domain/DNS setup, video provider's permitted usage and expected viewer count.
Publish ONLY the viewer service on local port 17862, never the manager on 17860/17861 or camera RTSP port 554.
Do not forward camera port 554 in the router.
Keep /watch/ and /watch/media/ on the same public origin; do not cache their responses.
The computer and manager must remain running for live video.
This initial viewer uses one outgoing video stream per active viewer; a video distribution service is needed for larger audiences.

Once the HTTPS viewer hostname is working, enter its origin in Settings (for example https://live.example.com).
That field generates the /watch/ link; it does not create a hostname, HTTPS certificate or relay.
Add the tested link to the website only after the public connection works from outside the home network.

## Verification completed

Automated tests cover camera allowlisting, no credential exposure, blocked controller routes, no video requests on page load,
playlist and segment delivery, rejected external playlist URLs, disabled sharing and paused cameras.
The public viewer page has also been opened in the browser for layout/accessibility inspection.
Actual camera playback over a public HTTPS connection remains to be verified on the camera computer.
