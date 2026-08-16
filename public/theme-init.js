(() => {
    try {
        const preferences = JSON.parse(localStorage.getItem('logstream-preferences') || '{}');
        const savedTheme = preferences?.appearance?.theme || localStorage.getItem('logstream-theme');

        document.documentElement.classList.toggle('dark', savedTheme === 'dark');
    } catch {
        // Keep the default light theme when storage is unavailable.
    }
})();
