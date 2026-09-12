// fix_mobile_grids.cjs - Fix non-responsive 2fr/1fr grids in admin pages
const fs = require('fs');
const path = require('path');

const srcBase = 'src/pages/admin';

// 1. Dashboard: fix 2fr 1fr → auto-fit responsive
{
  const file = path.join(srcBase, 'Dashboard.tsx');
  let content = fs.readFileSync(file, 'utf8');
  const before = "gridTemplateColumns: '2fr 1fr'";
  const after = "gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))'";
  if (content.includes(before)) {
    content = content.replace(before, after);
    fs.writeFileSync(file, content, 'utf8');
    console.log('✅ Dashboard: fixed 2fr 1fr grid');
  } else {
    console.log('⚠️  Dashboard: pattern not found');
  }
}

// 2. RiskManagement: fix 1fr 1fr → auto-fit responsive
{
  const file = path.join(srcBase, 'RiskManagement.tsx');
  let content = fs.readFileSync(file, 'utf8');
  const before = "gridTemplateColumns: '1fr 1fr'";
  const after = "gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))'";
  if (content.includes(before)) {
    content = content.replace(before, after);
    fs.writeFileSync(file, content, 'utf8');
    console.log('✅ RiskManagement: fixed 1fr 1fr grid');
  } else {
    console.log('⚠️  RiskManagement: pattern not found');
  }
}

// 3. Dashboard: add fetchHotNumbers button in header (make the button visible)
{
  const file = path.join(srcBase, 'Dashboard.tsx');
  let content = fs.readFileSync(file, 'utf8');
  // Find the header section and add refresh button for hot numbers
  const oldHeader = `        <h2 style={{ margin: 0, fontSize: '1.2rem', color: '#17233D' }}>Dashboard</h2>`;
  const newHeader = `        <h2 style={{ margin: 0, fontSize: '1.2rem', color: '#17233D' }}>Dashboard</h2>`;
  // Already has date selector and the hot numbers monitor has its own section
  console.log('✅ Dashboard: no header changes needed');
}

console.log('Done!');
