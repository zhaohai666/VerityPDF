// Build validation script
const fs = require('fs');
const path = require('path');

console.log('Validating build configuration...');

// Check package.json
const pkgPath = path.join(__dirname, 'package.json');
if (!fs.existsSync(pkgPath)) {
  console.error('❌ package.json not found');
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

// Check build config
if (!pkg.build) {
  console.error('❌ build configuration missing in package.json');
  process.exit(1);
}

// Check required platforms
const platforms = ['mac', 'win', 'linux'];
platforms.forEach(platform => {
  if (!pkg.build[platform]) {
    console.warn(`⚠️  ${platform} configuration missing`);
  } else {
    console.log(`✅ ${platform} configuration found`);
  }
});

// Check icons
const iconPath = path.join(__dirname, 'resources/icon.png');
if (!fs.existsSync(iconPath)) {
  console.warn('⚠️  Application icon not found at resources/icon.png');
} else {
  console.log('✅ Application icon found');
}

// Check electron entry point
if (!pkg.main) {
  console.error('❌ main entry not specified');
  process.exit(1);
}
console.log(`✅ Main entry: ${pkg.main}`);

// Check scripts
const requiredScripts = ['pack:mac', 'pack:win', 'pack:linux'];
requiredScripts.forEach(script => {
  if (!pkg.scripts[script]) {
    console.error(`❌ Script ${script} missing`);
    process.exit(1);
  }
  console.log(`✅ Script ${script} found`);
});

console.log('\n✅ Build configuration validation passed!');
console.log('\nTo test builds, run:');
console.log('  macOS: npm run pack:mac');
console.log('  Windows: npm run pack:win');
console.log('  Linux: npm run pack:linux');