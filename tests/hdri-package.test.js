const assert = require('node:assert/strict');
const path = require('node:path');

global.window = global;
require(path.join(__dirname, '..', 'Environment', 'HDRI', 'SMHDRIPackage.js'));

const files = [
    { name: 'DaySkyHDRI065B', webkitRelativePath: 'DaySkyHDRI065B/DaySkyHDRI065B.png' },
    { name: 'DaySkyHDRI065B_4K.blend', webkitRelativePath: 'DaySkyHDRI065B/DaySkyHDRI065B_4K.blend' },
    { name: 'DaySkyHDRI065B_4K.tres', webkitRelativePath: 'DaySkyHDRI065B/DaySkyHDRI065B_4K.tres' },
    { name: 'DaySkyHDRI065B_4K_HDR.exr', webkitRelativePath: 'DaySkyHDRI065B/DaySkyHDRI065B_4K_HDR.exr' },
    { name: 'DaySkyHDRI065B_4K_TONEMAPPED.jpg', webkitRelativePath: 'DaySkyHDRI065B/DaySkyHDRI065B_4K_TONEMAPPED.jpg' },
    { name: 'DaySkyHDRI065B_4K.usdc', webkitRelativePath: 'DaySkyHDRI065B/DaySkyHDRI065B_4K.usdc' }
];

const groups = window.SMHDRIPackage.groupFiles(files);
assert.equal(groups.length, 1);
assert.equal(groups[0].name, 'DaySkyHDRI065B');
assert.equal(groups[0].environmentFile.name, 'DaySkyHDRI065B_4K_HDR.exr');
assert.equal(groups[0].previewFile.name, 'DaySkyHDRI065B_4K_TONEMAPPED.jpg');
assert.equal(groups[0].files.length, 6);
assert.equal(window.SMHDRIPackage.classify(files[1]), 'companion');

console.log(JSON.stringify({
    passed: true,
    package: 'HDR/EXR + tonemapped preview + blend/tres/usdc companions'
}));
