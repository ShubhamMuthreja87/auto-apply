/**
 * The single user's id (D13, D26). Until login lands (ticket 15) every request
 * acts as this user; after it, the JWT's `sub` carries the same fixed id.
 */
export const DEMO_UID = "demo-user";
