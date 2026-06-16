const crypto = require('crypto');

function getUniqIdValue() {

  return crypto.randomBytes(32).toString('hex');
}

module.exports = { getUniqIdValue };
