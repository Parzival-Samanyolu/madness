// Runs before the page draws, so the saved dark/light theme shows without a flash.
// (A separate file because the site's security policy blocks inline scripts.)
document.documentElement.dataset.theme = localStorage.getItem('synapse-theme') === 'light' ? 'light' : 'dark'
