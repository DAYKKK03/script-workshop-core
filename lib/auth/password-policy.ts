const maximumPasswordLength = 128;

export function isUserPasswordAllowed(password: string) {
  return password.length >= 10 && password.length <= maximumPasswordLength;
}

export function isAdminPasswordAllowed(password: string) {
  return password.length >= 12 && password.length <= maximumPasswordLength;
}
