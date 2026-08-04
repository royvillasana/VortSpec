/** @type {import('tailwindcss').Config} */
module.exports = {
  // Scan component + story source so JIT generates every utility they use, including
  // arbitrary values like `bg-[var(--brand-primary-500)]`.
  content: ["./src/**/*.{ts,tsx,js,jsx,mdx}", "./.storybook/**/*.{ts,tsx,mdx}"],
  theme: { extend: {} },
  plugins: [],
};
