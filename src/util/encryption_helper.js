/** @todo move to env  
 * Increace @var CODEWORD_LENGTH to 7
*/

const CODEWORD_LENGTH = 5;
const SECRET_KEY = "asxdwesRfdrxf12saqwexftdf545x"; 

const encryptionMap = new Map();
const decryptionMap = new Map();

function hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
    }
    return hash >>> 0;
}

function seededRandomGenerator(seed) {
    return function () {
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        return seed / 4294967296;
    };
}

function shuffle(array, randomFn) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(randomFn() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

function generateRandomCodeword(randomFn, length) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(randomFn() * chars.length));
    }
    return result;
}

function generateMappingsFromSecret(secret) {
    const seed = hashCode(secret);
    const random = seededRandomGenerator(seed);

    const allowedChars = [];
    for (let c = 32; c <= 126; c++) {
        allowedChars.push(String.fromCharCode(c));
    }

    shuffle(allowedChars, random);
    const usedCodewords = new Set();

    for (const ch of allowedChars) {
        let codeword;
        do {
            codeword = generateRandomCodeword(random, CODEWORD_LENGTH);
        } while (usedCodewords.has(codeword));

        encryptionMap.set(ch, codeword);
        decryptionMap.set(codeword, ch);
        usedCodewords.add(codeword);
    }
}

function encrypt(input) {
    input = normalizeString(input);
    let encrypted = "";
    firstChar = input?.charAt?.(0)?.toLowerCase();
    if(input===null||input===undefined||input.length===0||input.trim().length===0){
        return null;
    }
    for (const c of input) {
        if (encryptionMap.has(c)) {
            encrypted += encryptionMap.get(c);
        } else {
            throw new Error(`Unsupported character: ${c}`);
        }
    }
    encrypted = firstChar + encrypted;
    return encrypted;
}

function decrypt(encrypted,isName = false) {
    let decrypted = "";
    if(encrypted){
        const trimmed = encrypted?.substring(1); 

        for (let i = 0; i < trimmed.length; i += CODEWORD_LENGTH) {
            const codeword = trimmed.substring(i, i + CODEWORD_LENGTH);
            if (decryptionMap.has(codeword)) {
                decrypted += decryptionMap.get(codeword);
            } else {
                throw new Error(`Unknown codeword: ${codeword}`);
            }
        }
    }
    if(isName === true){
        decrypted = toPascalCase(decrypted);
    }
    return decrypted;
}

function toPascalCase(string) {
  return string
    .replace(/([a-z])([A-Z])/g, '$1 $2') 
    .replace(/[-_]+|[^\p{L}\p{N}]/gu, ' ') 
    .toLowerCase() 
    .replace(/(?:^|\s)(\p{L})/gu, (_, letter) => letter.toUpperCase()) 
    .replace(/\s+/g, ''); 
}

// Initialize mappings
generateMappingsFromSecret(SECRET_KEY);

/**
 * 
 * Function to normalize strings by removing diacritics
 * example "Štefan" -> "Stefan"
 */
function normalizeString(string) {
  return string.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

const encryptFields = async (fields) => {
    const encryptedFields = {};
    for (const key in fields) {
        if (fields.hasOwnProperty(key)) {
            encryptedFields[key] = encrypt(fields[key]);
        }
    }
    return encryptedFields;
};

module.exports = {
    encrypt,
    decrypt,
    encryptFields
};



/* 
// Test
const original = "Diksha@123!";
// const original1 = "Shu";
const encrypted = encrypt(original);
// const encrypted1 = encrypt(original1);
const decrypted = decrypt(encrypted);
// const decrypted1 = decrypt(encrypted1);

// console.log("Original:  ", original);
// console.log("Encrypted: ", encrypted);

// console.log("Original:  ", original1);
// console.log("Encrypted: ", encrypted1);

// console.log("Decrypted: ", decrypted);
// console.log("Decrypted: ", decrypted1);
 */
