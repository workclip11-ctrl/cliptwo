/**
 * Normalize an Indian phone number to +91XXXXXXXXXX format.
 * Accepts: 10-digit, +91 prefix, 91 prefix, with/without spaces/dashes.
 * Returns null if the input is not a valid Indian phone number.
 */
export function normalizeIndianPhone(input: string): string | null {
  const digits = input.replace(/\D/g, "");

  let ten: string | null = null;
  if (digits.length === 10) {
    ten = digits;
  } else if (digits.length === 12 && digits.startsWith("91")) {
    ten = digits.slice(2);
  } else if (digits.length === 13 && digits.startsWith("091")) {
    ten = digits.slice(3);
  }

  if (!ten) return null;
  if (!/^[6-9]\d{9}$/.test(ten)) return null;

  return `+91${ten}`;
}
