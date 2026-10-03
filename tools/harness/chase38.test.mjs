import assert from 'node:assert/strict';
import {CREATURES} from '../../src/game/creatures.js';
import {scaleFor} from '../../src/game/balance_core.js';
assert(CREATURES.hound.run*scaleFor(30,100).speed<8.2,'regular blind hound chase must remain below native unloaded player sprint even at late maximum threat');
assert(CREATURES.crawler.run<=7,'crawler straight-line rush must leave an ordinary sprint margin before elite scaling');
assert.equal(CREATURES.hound.power,2);assert.equal(CREATURES.crawler.power,2);
assert.equal(CREATURES.scuttler.run,5.4,'already slower common creatures retain their identities');
console.log('chase38: targeted regular hound sprint margin and crawler rush tuning passed');
