import { BayesClassifier } from "natural/lib/natural/classifiers/index.js";
import { Transaction } from "plaid";
import { mapCategoriesToXCategory } from "./middleware";
import path from 'path';

// 1. Feature Extraction (Crucial!)
function extractFeatures(transaction: Transaction): string {
    // Combine relevant text fields into a single string for simplicity.
    // In a real application, you'd likely want to do more advanced feature engineering.
    // Consider things like:
    // - Word counts
    // - TF-IDF
    // - N-grams
    // - Regular expressions for common patterns
    // - Embeddings (if using a library that supports it)

    const featuresArray = [
        transaction.name,
        ...(transaction.category ?? []),
        transaction.merchant_name,
        ...transaction.counterparties?.map(counterparty => counterparty.name) ?? [],
        transaction.personal_finance_category?.primary,
        transaction.personal_finance_category?.detailed,
        transaction.transaction_type,
        ...transaction.counterparties?.map(counterparty => counterparty.type) ?? [],
        ...transaction.counterparties?.map(counterparty => counterparty.website) ?? [],
        transaction.payment_channel,
        transaction.payment_meta?.payment_method,
        transaction.website,
        transaction.amount,
    ];

    return featuresArray.filter(Boolean).join(" ");
}

// 2. Train the Classifier (Do this once, ideally offline)
export function trainClassifier(transactions: Transaction[]): void {
    const classifier = new BayesClassifier();

    transactions.forEach(transaction => {
        const features = extractFeatures(transaction); // See function below
        const category = mapCategoriesToXCategory(transaction.category ?? []); // Use your existing mapping as a *training* label

        if (category !== "Uncategorized") { // Only train on categorized examples for simplicity
            classifier.addDocument(features, category);
        }
    });

    classifier.train();
    classifier.save(path.join(__dirname, 'classifier.json'));
}

// 3. Load the Classifier
export async function getClassifier(): Promise<BayesClassifier> {
    const classifierPath = path.join(__dirname, 'classifier1.json');
    return new Promise<BayesClassifier>((resolve, reject) => {
        BayesClassifier.load(classifierPath, null, (err, loadedClassifier) => {
            if (err) {
                console.error("Error loading classifier:", err);
                reject(err);
            } else {
                console.log("Classifier loaded successfully!");
                if (loadedClassifier) {
                    resolve(loadedClassifier);
                } else {
                    reject(new Error("Loaded classifier is undefined"));
                }
            }
        });
    });
}


// 4. Improved Category Mapping using the Classifier
export function classifyTransaction(transaction: Transaction, classifier: BayesClassifier): string {
    return classifier.classify(extractFeatures(transaction));
}