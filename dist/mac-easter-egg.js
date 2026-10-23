// A small developer-history Easter egg: activate the Mac About logo five times.
(() => {
  let activations = 0;
  let lastActivation = 0;
  let story;

  function openStory() {
    if (!story) {
      story = document.createElement('dialog');
      story.className = 'mac-developer-story';
      story.setAttribute('aria-labelledby', 'mac-story-title');
      story.innerHTML = `
        <form method="dialog">
          <div class="dialog-head">
            <h2 id="mac-story-title">A Special Message to macOS Users</h2>
            <button type="submit" value="close" aria-label="Close developer story">×</button>
          </div>
          <p>Congratulations! You're about to install MediaMTX Manager.</p>
          <p>This application is provided FREE because I wanted Mac users to enjoy it too.</p>
          <p>However, I'd like you to know that I spent approximately 48 FUCKING HOURS fighting macOS, VirtualBox, passwords, and network connections.</p>
          <p>So please enjoy this software.</p>
          <p>You're welcome.</p>
          <p>— The Developer</p>
          <p>P.S. If it doesn't work, blame Apple. I've suffered enough.</p>
          <div class="dialog-actions">
            <button class="primary" type="submit" value="thanks">I Appreciate Your Suffering</button>
            <button class="secondary" type="submit" value="windows">I'm Going Back to Windows</button>
          </div>
        </form>`;
      document.body.append(story);
    }
    // Both joke responses simply dismiss the story; camera jobs keep running.
    if (!story.open) story.showModal();
  }

  document.addEventListener('click', (event) => {
    if (!event.target.closest('[data-mac-history]')) return;
    const now = Date.now();
    activations = now - lastActivation < 6000 ? activations + 1 : 1;
    lastActivation = now;
    if (activations === 5) {
      activations = 0;
      openStory();
    }
  });
})();
