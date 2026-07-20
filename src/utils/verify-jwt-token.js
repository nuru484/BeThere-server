import jwt from "jsonwebtoken";

// Algorithm pinned everywhere a token is verified: secrets are HMAC strings,
// and leaving the list open invites alg-confusion regressions if a key object
// is ever passed.
export const JWT_ALGORITHMS = ["HS256"];

export const verifyJwtToken = (token, secret) =>
  new Promise((resolve, reject) => {
    jwt.verify(token, secret, { algorithms: JWT_ALGORITHMS }, (err, decoded) => {
      if (err) reject(err);
      else resolve(decoded);
    });
  });
