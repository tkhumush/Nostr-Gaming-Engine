import { useEffect, useRef, useState } from "react";
import {
  normalizePubkey,
  searchProfiles,
  type NostrProfile,
} from "@nostr-gaming-engine/core";
import "./OpponentSearch.css";

interface OpponentSearchProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (profile: NostrProfile) => void;
}

export function OpponentSearch({
  value,
  onChange,
  onSelect,
}: OpponentSearchProps) {
  const [results, setResults] = useState<NostrProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const trimmedValue = value.trim();
  const normalizedPubkey = normalizePubkey(trimmedValue);

  useEffect(() => {
    if (trimmedValue.length < 3) {
      setResults([]);
      setShowDropdown(false);
      setLoading(false);
      return;
    }

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(async () => {
      setLoading(true);
      setShowDropdown(true);
      try {
        const profiles = await searchProfiles(trimmedValue, 20);
        setResults(profiles);
        setSelectedIndex(0);
      } catch (error) {
        console.error("Opponent search failed:", error);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [trimmedValue]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        !inputRef.current?.contains(event.target as Node)
      ) {
        setShowDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!showDropdown || !dropdownRef.current) return;
    const selected = dropdownRef.current.querySelector(
      `[data-index="${selectedIndex}"]`,
    );
    if (selected) {
      selected.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex, showDropdown]);

  const getDisplayName = (profile: NostrProfile) =>
    profile.displayName || profile.name || "Anonymous";

  const getTruncatedPubkey = (pubkey: string) =>
    `${pubkey.slice(0, 8)}...${pubkey.slice(-8)}`;

  const handleSelect = (profile: NostrProfile) => {
    onSelect(profile);
    setResults([]);
    setShowDropdown(false);
    setSelectedIndex(0);
  };

  const handleUsePubkey = () => {
    if (!normalizedPubkey) return;
    handleSelect({ pubkey: normalizedPubkey });
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setShowDropdown(false);
      return;
    }

    if ((!showDropdown || results.length === 0) && event.key === "Enter") {
      if (normalizedPubkey) {
        event.preventDefault();
        handleUsePubkey();
      }
      return;
    }

    if (!showDropdown || results.length === 0) return;

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % results.length);
        break;
      case "ArrowUp":
        event.preventDefault();
        setSelectedIndex((prev) =>
          prev - 1 < 0 ? results.length - 1 : prev - 1,
        );
        break;
      case "Enter":
        event.preventDefault();
        if (results[selectedIndex]) {
          handleSelect(results[selectedIndex]);
        }
        break;
    }
  };

  const handleClear = () => {
    onChange("");
    setResults([]);
    setShowDropdown(false);
    inputRef.current?.focus();
  };

  return (
    <div className="opponent-search">
      <div className="opponent-search-input">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (trimmedValue.length >= 3) setShowDropdown(true);
          }}
          className="opponent-search-field"
          placeholder="Search by name, npub, or NIP-05"
        />
        <div className="opponent-search-icons">
          {loading && <span className="opponent-search-spinner" />}
          {value && (
            <button
              type="button"
              className="opponent-search-clear"
              onClick={handleClear}
              aria-label="Clear search"
            >
              x
            </button>
          )}
        </div>
      </div>

      {showDropdown && trimmedValue.length >= 3 && (
        <div className="opponent-search-dropdown" ref={dropdownRef}>
          {results.length > 0 ? (
            results.map((profile, index) => (
              <button
                key={profile.pubkey}
                type="button"
                data-index={index}
                className={`opponent-search-item ${
                  index === selectedIndex ? "selected" : ""
                }`}
                onClick={() => handleSelect(profile)}
              >
                {profile.picture ? (
                  <img
                    src={profile.picture}
                    alt={getDisplayName(profile)}
                    className="opponent-search-avatar"
                    onError={(event) => {
                      (event.target as HTMLImageElement).src =
                        "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23999999' stroke-width='2'%3E%3Ccircle cx='12' cy='12' r='10'/%3E%3Cpath d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4z'/%3E%3Cpath d='M4 20c0-4 3.6-6 8-6s8 2 8 6'/%3E%3C/svg%3E";
                    }}
                  />
                ) : (
                  <div className="opponent-search-avatar fallback">
                    {getDisplayName(profile).charAt(0).toUpperCase()}
                  </div>
                )}

                <div className="opponent-search-meta">
                  <div className="opponent-search-name">
                    {getDisplayName(profile)}
                  </div>
                  {profile.nip05 && (
                    <div className="opponent-search-nip05">
                      nip05: {profile.nip05}
                    </div>
                  )}
                  <div className="opponent-search-pubkey">
                    {getTruncatedPubkey(profile.pubkey)}
                  </div>
                </div>
              </button>
            ))
          ) : (
            <div className="opponent-search-empty">
              {loading ? (
                <span>Searching...</span>
              ) : normalizedPubkey ? (
                <>
                  <p>No profile found for this pubkey.</p>
                  <button
                    type="button"
                    className="opponent-search-use"
                    onClick={handleUsePubkey}
                  >
                    Use this pubkey
                  </button>
                  <span className="opponent-search-hint">Or press Enter</span>
                </>
              ) : (
                <span>No users found. Try a different search term.</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default OpponentSearch;
