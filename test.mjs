import { fetchPageSpeed } from './build/fetchPageSpeed.js';
import { fetchCrUX } from './build/fetchCrUX.js';

const API_KEY = process.argv[2];
const URL = process.argv[3] ?? 'https://example.com';

if (!API_KEY) {
  console.error('Usage: node test.mjs YOUR_API_KEY [url]');
  process.exit(1);
}

console.log(`Testing: ${URL}\n`);

const [labMobile, labDesktop] = await Promise.all([
  fetchPageSpeed(URL, 'mobile', API_KEY),
  fetchPageSpeed(URL, 'desktop', API_KEY),
]);

const fieldMobile = await fetchCrUX(URL, 'mobile', API_KEY);
const fieldDesktop = await fetchCrUX(URL, 'desktop', API_KEY);

console.log('=== Lab Data (Lighthouse) ===');
console.log('Mobile:', JSON.stringify(labMobile, null, 2));
console.log('Desktop:', JSON.stringify(labDesktop, null, 2));

console.log('\n=== Field Data (CrUX - Real Users) ===');
console.log('Mobile:', JSON.stringify(fieldMobile, null, 2));
console.log('Desktop:', JSON.stringify(fieldDesktop, null, 2));
