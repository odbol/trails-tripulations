const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node sanitize.js <json-file>');
  process.exit(1);
}

const inputFile = args[0];
const outputFile = inputFile.replace(/\.json$/, '-sanitized.json');

function randomizeCoord(coord) {
  const base = parseFloat(coord.toFixed(1));
  const random = (Math.random() * 2 - 1) * 0.8; // Random value between -0.9 and 0.9
  return parseFloat((base + random).toFixed(5));
}

try {
  const data = JSON.parse(fs.readFileSync(inputFile, 'utf8'));

  if (!Array.isArray(data)) {
    console.error('Error: JSON file must contain an array');
    process.exit(1);
  }

  const sanitized = data.map(event => {
      return {
        ...event,
        timeline: event.timeline.map(item => {
          const newItem = { ...item };

          if (typeof newItem.lat === 'number') {
            newItem.lat = randomizeCoord(newItem.lat);
          } else {
            throw new Error(`Invalid lat value: ${newItem.lat}`);
          }

          if (typeof newItem.lon === 'number') {
            newItem.lon = randomizeCoord(newItem.lon);
          } else {
            throw new Error(`Invalid lon value: ${newItem.lon}`);
          }

          return newItem;
        })
      };
    });

  fs.writeFileSync(outputFile, JSON.stringify(sanitized, null, 2));
  console.log(`✓ Sanitized ${data.length} items`);
  console.log(`✓ Saved to ${outputFile}`);
} catch (error) {
  console.error('Error:', error.message);
  process.exit(1);
}
