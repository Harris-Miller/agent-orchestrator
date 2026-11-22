<!-- PROTOTYPE (#435) variant C — the landing page is a terminal window running `man hoa`; the man page is the slot. -->

<template>
  <div class="terminal-home">
    <div class="window">
      <div class="window-bar"><i /><i /><i /><span>~/projects — zsh</span></div>
      <div class="window-body">
        <pre class="banner" aria-hidden="true">
 _
| |__   ___   __ _
| '_ \ / _ \ / _` |
| | | | (_) | (_| |
|_| |_|\___/ \__,_|   harness orchestrating agents</pre>
        <p class="cmd"><span class="prompt">$</span> man hoa<span class="cursor" /></p>
        <div class="man-page"><slot /></div>
        <p class="cmd"><span class="prompt">$</span> <span class="hint">press ⌘K to search the docs</span></p>
      </div>
    </div>
  </div>
</template>
