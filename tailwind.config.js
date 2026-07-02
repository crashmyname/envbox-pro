/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: 'class',
    content: [
        './src/index.html',      // ✅ Path dari root ke src/
        './src/**/*.html',       // ✅ Semua HTML di src/
        './src/**/*.js',         // ✅ Semua JS di src/
    ],
    theme: {
        extend: {}
    }
}