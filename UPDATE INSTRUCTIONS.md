# Recording timer and server controls update

On the computer running your cameras:

1. In the manager, open Settings and choose **Quit manager**. This stops the background program so its files can be updated.
2. Extract this update ZIP into your **existing MediaMTX Manager folder**. Allow Windows to replace **server.mjs** and the **dist** folder's files.
3. Keep your existing **data** and **runtime** folders. This update does not include or replace either folder. Your camera settings, encrypted passwords and saved recordings remain there.
4. Double-click **Start Manager.vbs** once to reopen the updated manager. Refresh its browser page if necessary.

New in this update:

- A timer on each camera card shows the current recording time in minutes and seconds, with hours for longer sessions. It pauses when the stream is not running. After Stop recording, the card shows the elapsed time of the last recording session.
- Separate **Start server** and **Stop server** buttons appear at the top of every page and in Settings. The unavailable action is disabled.
- Stopping MediaMTX keeps the manager open, so you can use Start server in that same window. Controls update immediately, including when editing unsaved workspace settings.
- Quit manager still exits the background program. Reopen Start Manager.vbs after quitting it. This update does not turn the browser app into a standalone desktop application.

The timer measures elapsed recording-session time; it is not a frame-accurate duration read from a video file. Existing older recordings do not gain historical timer values.

No CMD or dependency installation is required.
