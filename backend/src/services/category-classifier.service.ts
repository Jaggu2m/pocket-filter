export interface LabeledTransactionText {
  category: string;
  text: string;
}

export interface ClassifierResult {
  category: string;
  confidence: number;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2 && !['the', 'and', 'for', 'upi', 'txn'].includes(token));
}

function cosine(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  let aMagnitude = 0;
  let bMagnitude = 0;
  for (const [term, value] of a) {
    aMagnitude += value * value;
    dot += value * (b.get(term) || 0);
  }
  for (const value of b.values()) bMagnitude += value * value;
  return aMagnitude && bMagnitude ? dot / Math.sqrt(aMagnitude * bMagnitude) : 0;
}

/** A small, explainable TF-IDF nearest-centroid classifier trained from a user's corrections. */
export class CategoryClassifierService {
  classify(input: string, examples: LabeledTransactionText[]): ClassifierResult | null {
    const queryTokens = tokenize(input);
    const categories = new Set(examples.map((example) => example.category));
    if (queryTokens.length === 0 || examples.length < 5 || categories.size < 2) return null;

    const documents = examples.map((example) => ({ ...example, tokens: tokenize(example.text) }));
    const documentFrequency = new Map<string, number>();
    for (const document of documents) {
      for (const term of new Set(document.tokens)) {
        documentFrequency.set(term, (documentFrequency.get(term) || 0) + 1);
      }
    }
    const vectorize = (tokens: string[]): Map<string, number> => {
      const frequency = new Map<string, number>();
      for (const term of tokens) frequency.set(term, (frequency.get(term) || 0) + 1);
      const vector = new Map<string, number>();
      for (const [term, count] of frequency) {
        const idf = Math.log((documents.length + 1) / ((documentFrequency.get(term) || 0) + 1)) + 1;
        vector.set(term, (count / tokens.length) * idf);
      }
      return vector;
    };

    const centroids = new Map<string, Map<string, number>>();
    const counts = new Map<string, number>();
    for (const document of documents) {
      const centroid = centroids.get(document.category) || new Map<string, number>();
      for (const [term, value] of vectorize(document.tokens)) centroid.set(term, (centroid.get(term) || 0) + value);
      centroids.set(document.category, centroid);
      counts.set(document.category, (counts.get(document.category) || 0) + 1);
    }
    for (const [category, centroid] of centroids) {
      const count = counts.get(category)!;
      for (const [term, value] of centroid) centroid.set(term, value / count);
    }

    const queryVector = vectorize(queryTokens);
    let best: ClassifierResult | null = null;
    for (const [category, centroid] of centroids) {
      const confidence = cosine(queryVector, centroid);
      if (!best || confidence > best.confidence) best = { category, confidence };
    }
    return best && best.confidence >= 0.35 ? best : null;
  }
}

export const categoryClassifierService = new CategoryClassifierService();
