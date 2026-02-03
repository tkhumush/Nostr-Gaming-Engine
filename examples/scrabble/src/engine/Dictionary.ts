interface TrieNode {
  children: Map<string, TrieNode>;
  isWord: boolean;
}

export class Dictionary {
  private root: TrieNode;
  private loaded: boolean = false;
  private wordCount: number = 0;

  constructor() {
    this.root = this.createNode();
  }

  private createNode(): TrieNode {
    return {
      children: new Map(),
      isWord: false,
    };
  }

  /**
   * Load dictionary from an array of words
   */
  loadWords(words: string[]): void {
    for (const word of words) {
      this.addWord(word.toUpperCase().trim());
    }
    this.loaded = true;
  }

  /**
   * Load dictionary from a newline-separated string
   */
  loadFromText(text: string): void {
    const words = text.split('\n').filter(w => w.trim().length > 0);
    this.loadWords(words);
  }

  /**
   * Load dictionary from a URL (for browser)
   */
  async loadFromUrl(url: string): Promise<void> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load dictionary from ${url}`);
    }
    const text = await response.text();
    this.loadFromText(text);
  }

  /**
   * Add a single word to the trie
   */
  addWord(word: string): void {
    if (word.length === 0) return;

    let node = this.root;
    for (const char of word) {
      if (!node.children.has(char)) {
        node.children.set(char, this.createNode());
      }
      node = node.children.get(char)!;
    }

    if (!node.isWord) {
      node.isWord = true;
      this.wordCount++;
    }
  }

  /**
   * Check if a word exists in the dictionary
   * O(n) where n is word length
   */
  isValidWord(word: string): boolean {
    if (!this.loaded) {
      throw new Error('Dictionary not loaded');
    }

    const normalized = word.toUpperCase().trim();
    if (normalized.length < 2) {
      return false; // Minimum word length is 2
    }

    let node = this.root;
    for (const char of normalized) {
      const child = node.children.get(char);
      if (!child) {
        return false;
      }
      node = child;
    }

    return node.isWord;
  }

  /**
   * Check if a prefix exists (useful for game hints)
   */
  hasPrefix(prefix: string): boolean {
    const normalized = prefix.toUpperCase().trim();
    let node = this.root;

    for (const char of normalized) {
      const child = node.children.get(char);
      if (!child) {
        return false;
      }
      node = child;
    }

    return true;
  }

  /**
   * Get all words with a given prefix (limited for performance)
   */
  getWordsWithPrefix(prefix: string, limit: number = 100): string[] {
    const normalized = prefix.toUpperCase().trim();
    let node = this.root;

    for (const char of normalized) {
      const child = node.children.get(char);
      if (!child) {
        return [];
      }
      node = child;
    }

    const results: string[] = [];
    this.collectWords(node, normalized, results, limit);
    return results;
  }

  private collectWords(
    node: TrieNode,
    prefix: string,
    results: string[],
    limit: number
  ): void {
    if (results.length >= limit) return;

    if (node.isWord) {
      results.push(prefix);
    }

    for (const [char, child] of node.children) {
      this.collectWords(child, prefix + char, results, limit);
      if (results.length >= limit) return;
    }
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  getWordCount(): number {
    return this.wordCount;
  }
}

// Singleton instance for the app
let dictionaryInstance: Dictionary | null = null;

export function getDictionary(): Dictionary {
  if (!dictionaryInstance) {
    dictionaryInstance = new Dictionary();
  }
  return dictionaryInstance;
}

export function resetDictionary(): void {
  dictionaryInstance = null;
}
