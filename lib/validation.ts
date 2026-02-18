const B58_CHARS = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function validateName(v: string): string | null {
  if (!v || v.length === 0) return "name is required";
  if (v.length > 32) return "name must be 32 characters or less";
  return null;
}

export function validateSymbol(v: string): string | null {
  if (!v || v.length === 0) return "symbol is required";
  if (v.length > 10) return "symbol must be 10 characters or less";
  return null;
}

export function validateUrl(v: string, required: boolean): string | null {
  if (!v || v.length === 0) {
    return required ? "url is required" : null;
  }
  if (
    !v.startsWith("http://") &&
    !v.startsWith("https://") &&
    !v.startsWith("ipfs://") &&
    !v.startsWith("ar://")
  ) {
    return "url must start with http://, https://, ipfs://, or ar://";
  }
  return null;
}

export function validateSellerFee(v: number): string | null {
  if (!Number.isInteger(v)) return "must be a whole number";
  if (v < 0) return "must be 0 or greater";
  if (v > 10000) return "must be 10000 or less (100%)";
  return null;
}

export function validateCreatorAddress(v: string): string | null {
  if (!v || v.length === 0) return "address is required";
  if (v.length < 32 || v.length > 44) return "invalid address length";
  for (const ch of v) {
    if (!B58_CHARS.includes(ch)) return "invalid base58 character";
  }
  return null;
}

export function validateCreatorShares(
  creators: { share: number }[]
): string | null {
  if (creators.length === 0) return null;
  const total = creators.reduce((sum, c) => sum + c.share, 0);
  if (total !== 100) return `shares must sum to 100 (currently ${total})`;
  return null;
}

const REQUIRED_METAPLEX_FIELDS = ["name", "symbol", "image"];

export function validateMetadataJson(
  json: string
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { valid: false, errors: ["invalid JSON syntax"] };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { valid: false, errors: ["JSON must be an object"] };
  }

  for (const field of REQUIRED_METAPLEX_FIELDS) {
    if (!(field in parsed) || !parsed[field]) {
      errors.push(`missing required field: ${field}`);
    }
  }

  if ("seller_fee_basis_points" in parsed) {
    const fee = parsed.seller_fee_basis_points;
    if (typeof fee !== "number" || fee < 0 || fee > 10000) {
      errors.push("seller_fee_basis_points must be 0-10000");
    }
  }

  if ("creators" in parsed && Array.isArray(parsed.creators)) {
    const creators = parsed.creators as Array<Record<string, unknown>>;
    const shareSum = creators.reduce((s, c) => s + (Number(c.share) || 0), 0);
    if (shareSum !== 100) {
      errors.push(`creator shares must sum to 100 (got ${shareSum})`);
    }
  }

  if ("attributes" in parsed && !Array.isArray(parsed.attributes)) {
    errors.push("attributes must be an array");
  }

  return { valid: errors.length === 0, errors };
}
