import { useState, useEffect, useCallback, useRef } from "react";
import {
  getCurrentUser,
  uploadImage,
  fetchProfileMetadata,
  updateProfile,
} from "@nostr-gaming-engine/core";
import { CameraIcon } from "./icons/LoginIcons";
import "./ProfileSettings.css";

interface ProfileSettingsProps {
  onClose: () => void;
  onToast?: (message: string, tone?: "success" | "error" | "info") => void;
}

interface FormState {
  displayName: string;
  name: string;
  about: string;
  picture: string;
  banner: string;
  nip05: string;
  website: string;
  lud16: string;
}

const DISPLAY_NAME_LIMIT = 50;
const NAME_LIMIT = 30;

const initialFormState: FormState = {
  displayName: "",
  name: "",
  about: "",
  picture: "",
  banner: "",
  nip05: "",
  website: "",
  lud16: "",
};

export function ProfileSettings({ onClose, onToast }: ProfileSettingsProps) {
  const [formState, setFormState] = useState<FormState>(initialFormState);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadingPicture, setUploadingPicture] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);

  const pictureInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  const user = getCurrentUser();

  // Load profile on mount
  useEffect(() => {
    async function loadProfile() {
      if (!user?.pubkey) {
        setError("Not logged in");
        setLoading(false);
        return;
      }

      try {
        const metadata = await fetchProfileMetadata(user.pubkey);
        if (metadata) {
          setFormState({
            displayName: String(
              metadata.display_name || metadata.displayName || "",
            ),
            name: String(metadata.name || ""),
            about: String(metadata.about || ""),
            picture: String(metadata.picture || ""),
            banner: String(metadata.banner || ""),
            nip05: String(metadata.nip05 || ""),
            website: String(metadata.website || ""),
            lud16: String(metadata.lud16 || ""),
          });
        }
      } catch (err) {
        console.error("[ProfileSettings] Failed to load profile:", err);
        setError("Failed to load profile");
      } finally {
        setLoading(false);
      }
    }

    loadProfile();
  }, [user?.pubkey]);

  const handleInputChange = useCallback(
    (field: keyof FormState) =>
      (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const value = e.target.value;

        // Enforce character limits
        if (field === "displayName" && value.length > DISPLAY_NAME_LIMIT)
          return;
        if (field === "name" && value.length > NAME_LIMIT) return;

        setFormState((prev) => ({ ...prev, [field]: value }));
        setError(null);
      },
    [],
  );

  const handlePictureUpload = useCallback(async (file: File) => {
    setUploadingPicture(true);
    setError(null);

    try {
      const url = await uploadImage(file);
      setFormState((prev) => ({ ...prev, picture: url }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      setError(`Picture upload failed: ${message}`);
    } finally {
      setUploadingPicture(false);
    }
  }, []);

  const handleBannerUpload = useCallback(async (file: File) => {
    setUploadingBanner(true);
    setError(null);

    try {
      const url = await uploadImage(file);
      setFormState((prev) => ({ ...prev, banner: url }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      setError(`Banner upload failed: ${message}`);
    } finally {
      setUploadingBanner(false);
    }
  }, []);

  const handleFileChange = useCallback(
    (type: "picture" | "banner") =>
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (type === "picture") {
          handlePictureUpload(file);
        } else {
          handleBannerUpload(file);
        }

        // Reset input so same file can be selected again
        e.target.value = "";
      },
    [handlePictureUpload, handleBannerUpload],
  );

  const handleSave = useCallback(async () => {
    if (!user?.pubkey) {
      setError("Not logged in");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await updateProfile({
        display_name: formState.displayName,
        name: formState.name,
        about: formState.about,
        picture: formState.picture,
        banner: formState.banner,
        nip05: formState.nip05,
        website: formState.website,
        lud16: formState.lud16,
      });

      onToast?.("Profile updated!", "success");
      onClose();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to save profile";
      setError(message);
    } finally {
      setSaving(false);
    }
  }, [user?.pubkey, formState, onClose, onToast]);

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose],
  );

  const displayNameForPreview =
    formState.displayName || formState.name || "You";

  return (
    <div className="profile-settings-overlay" onClick={handleOverlayClick}>
      <div className="profile-settings-modal">
        <button className="profile-settings-close" onClick={onClose}>
          &times;
        </button>

        <h2>Edit Profile</h2>

        {error && <div className="profile-error">{error}</div>}

        {loading ? (
          <div
            style={{ textAlign: "center", padding: "40px", color: "#7a7a7a" }}
          >
            Loading profile...
          </div>
        ) : (
          <>
            {/* Banner */}
            <div className="profile-banner-section">
              <div
                className={`profile-banner-preview ${formState.banner ? "has-image" : ""}`}
                style={
                  formState.banner
                    ? { backgroundImage: `url(${formState.banner})` }
                    : undefined
                }
              >
                {!formState.banner && (
                  <div className="profile-banner-placeholder">
                    <span className="profile-banner-placeholder-icon">🖼</span>
                    <span>Add a banner image</span>
                  </div>
                )}
                <button
                  className="profile-banner-upload-btn"
                  onClick={() => bannerInputRef.current?.click()}
                  disabled={uploadingBanner}
                >
                  {uploadingBanner ? (
                    <>
                      <span className="profile-spinner" />
                      Uploading...
                    </>
                  ) : (
                    "Upload Banner"
                  )}
                </button>
              </div>
            </div>

            {/* Avatar */}
            <div className="profile-avatar-section">
              <div className="profile-avatar-container">
                <div
                  className={`profile-avatar-preview ${formState.picture ? "has-image" : ""}`}
                  style={
                    formState.picture
                      ? { backgroundImage: `url(${formState.picture})` }
                      : undefined
                  }
                >
                  {!formState.picture && (
                    <span className="profile-avatar-placeholder">👤</span>
                  )}
                </div>
                <button
                  className="profile-avatar-upload-btn"
                  onClick={() => pictureInputRef.current?.click()}
                  disabled={uploadingPicture}
                  title="Upload picture"
                >
                  {uploadingPicture ? (
                    <span className="profile-spinner" />
                  ) : (
                    <CameraIcon />
                  )}
                </button>
              </div>
              <div className="profile-avatar-info">
                <span className="profile-avatar-info-name">
                  {displayNameForPreview}
                </span>
                <span className="profile-avatar-info-hint">
                  Click camera to change picture
                </span>
              </div>
            </div>

            {/* Hidden file inputs */}
            <input
              ref={pictureInputRef}
              type="file"
              accept="image/*"
              className="profile-file-input"
              onChange={handleFileChange("picture")}
            />
            <input
              ref={bannerInputRef}
              type="file"
              accept="image/*"
              className="profile-file-input"
              onChange={handleFileChange("banner")}
            />

            {/* Form */}
            <div className="profile-form">
              <div className="profile-form-group">
                <label className="profile-form-label">
                  <span>Display Name</span>
                  <span
                    className={`profile-char-count ${formState.displayName.length >= DISPLAY_NAME_LIMIT - 5 ? "warning" : ""}`}
                  >
                    {formState.displayName.length}/{DISPLAY_NAME_LIMIT}
                  </span>
                </label>
                <input
                  type="text"
                  className="profile-input"
                  value={formState.displayName}
                  onChange={handleInputChange("displayName")}
                  placeholder="How you want to be known"
                  maxLength={DISPLAY_NAME_LIMIT}
                />
              </div>

              <div className="profile-form-group">
                <label className="profile-form-label">
                  <span>Username</span>
                  <span
                    className={`profile-char-count ${formState.name.length >= NAME_LIMIT - 5 ? "warning" : ""}`}
                  >
                    {formState.name.length}/{NAME_LIMIT}
                  </span>
                </label>
                <input
                  type="text"
                  className="profile-input"
                  value={formState.name}
                  onChange={handleInputChange("name")}
                  placeholder="Short identifier"
                  maxLength={NAME_LIMIT}
                />
              </div>

              <div className="profile-form-group">
                <label className="profile-form-label">
                  <span>Bio</span>
                </label>
                <textarea
                  className="profile-textarea"
                  value={formState.about}
                  onChange={handleInputChange("about")}
                  placeholder="Tell us about yourself"
                  rows={3}
                />
              </div>

              <div className="profile-form-group">
                <label className="profile-form-label">
                  <span>Profile Picture URL</span>
                </label>
                <div className="profile-image-row">
                  <input
                    type="url"
                    className="profile-input"
                    value={formState.picture}
                    onChange={handleInputChange("picture")}
                    placeholder="https://..."
                  />
                  <button
                    className="profile-upload-btn"
                    onClick={() => pictureInputRef.current?.click()}
                    disabled={uploadingPicture}
                  >
                    {uploadingPicture ? (
                      <span className="profile-spinner" />
                    ) : (
                      "Upload"
                    )}
                  </button>
                </div>
              </div>

              <div className="profile-form-group">
                <label className="profile-form-label">
                  <span>Banner URL</span>
                </label>
                <div className="profile-image-row">
                  <input
                    type="url"
                    className="profile-input"
                    value={formState.banner}
                    onChange={handleInputChange("banner")}
                    placeholder="https://..."
                  />
                  <button
                    className="profile-upload-btn"
                    onClick={() => bannerInputRef.current?.click()}
                    disabled={uploadingBanner}
                  >
                    {uploadingBanner ? (
                      <span className="profile-spinner" />
                    ) : (
                      "Upload"
                    )}
                  </button>
                </div>
              </div>

              <div className="profile-form-group">
                <label className="profile-form-label">
                  <span>NIP-05 Identifier</span>
                </label>
                <input
                  type="text"
                  className="profile-input"
                  value={formState.nip05}
                  onChange={handleInputChange("nip05")}
                  placeholder="you@example.com"
                />
                <span className="profile-form-hint">
                  Nostr verification identifier
                </span>
              </div>

              <div className="profile-form-group">
                <label className="profile-form-label">
                  <span>Website</span>
                </label>
                <input
                  type="url"
                  className="profile-input"
                  value={formState.website}
                  onChange={handleInputChange("website")}
                  placeholder="https://yoursite.com"
                />
              </div>

              <div className="profile-form-group">
                <label className="profile-form-label">
                  <span>Lightning Address</span>
                </label>
                <input
                  type="text"
                  className="profile-input"
                  value={formState.lud16}
                  onChange={handleInputChange("lud16")}
                  placeholder="you@getalby.com"
                />
                <span className="profile-form-hint">For receiving zaps</span>
              </div>
            </div>

            {/* Actions */}
            <div className="profile-actions">
              <button
                className="profile-btn secondary"
                onClick={onClose}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                className="profile-btn primary"
                onClick={handleSave}
                disabled={saving || uploadingPicture || uploadingBanner}
              >
                {saving ? (
                  <>
                    <span className="profile-spinner" /> Saving...
                  </>
                ) : (
                  "Save Profile"
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default ProfileSettings;
