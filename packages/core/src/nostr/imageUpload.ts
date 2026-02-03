import { NDKEvent } from "@nostr-dev-kit/ndk";
import { getNDK } from "./client";

const NOSTR_BUILD_UPLOAD_URL = "https://nostr.build/api/v2/upload/files";
const NIP98_AUTH_KIND = 27235;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Create a NIP-98 HTTP Auth header for authenticated uploads
 * Creates and signs a kind:27235 event, then base64 encodes it
 */
export async function createNip98AuthHeader(
  url: string,
  method: string,
): Promise<string> {
  const ndk = getNDK();

  if (!ndk.signer) {
    throw new Error("No signer available. Please connect with NIP-07 first.");
  }

  const event = new NDKEvent(ndk);
  event.kind = NIP98_AUTH_KIND;
  event.content = "";
  event.tags = [
    ["u", url],
    ["method", method.toUpperCase()],
  ];

  await event.sign();

  // Get the raw event for serialization
  const rawEvent = event.rawEvent();
  const eventJson = JSON.stringify(rawEvent);
  const base64Event = btoa(eventJson);

  return `Nostr ${base64Event}`;
}

/**
 * Upload an image file to nostr.build with NIP-98 authentication
 * Returns the URL of the uploaded image
 */
export async function uploadImage(file: File): Promise<string> {
  // Validate file type
  if (!file.type.startsWith("image/")) {
    throw new Error("Only image files are allowed");
  }

  // Validate file size
  if (file.size > MAX_FILE_SIZE) {
    throw new Error("File size must be less than 10MB");
  }

  // Create NIP-98 auth header
  const authHeader = await createNip98AuthHeader(
    NOSTR_BUILD_UPLOAD_URL,
    "POST",
  );

  // Prepare form data
  const formData = new FormData();
  formData.append("file", file);

  // Upload to nostr.build
  const response = await fetch(NOSTR_BUILD_UPLOAD_URL, {
    method: "POST",
    headers: {
      Authorization: authHeader,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    throw new Error(`Upload failed: ${response.status} - ${errorText}`);
  }

  const result = await response.json();

  // nostr.build returns: { status: "success", data: [{ url: "..." }] }
  if (result.status !== "success" || !result.data?.[0]?.url) {
    throw new Error("Upload failed - no URL returned");
  }

  return result.data[0].url;
}
