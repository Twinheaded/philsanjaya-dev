---
title: Market sentiment
slug: market-sentiment
order: 3
expNo: 3
diagram: market-sentiment
tags: [machine-learning, nlp]
stack: [Python, TensorFlow/Keras, scikit-learn, XGBoost, FinBERT]
period: '2025'
summary: Multi-tool news sentiment meets stock prediction, with results held to receipts
question: Does news sentiment add predictive signal beyond technical indicators?
status: published
metrics:
  - label: F1, baseline → enhanced
    value: 0.2222 → 0.5714
    source: Stock Prediction Project Report §III, Figs 1–2 — +0.3492 improvement
  - label: Direction accuracy, baseline → enhanced
    value: 39.1% → 47.8%
    source: Stock Prediction Project Report §III, Figs 1–2 — 86 train / 23 test samples
  - label: ROC AUC change with sentiment
    value: '+0.000'
    source: Stock Prediction Project Report §III — 0.3917 both models, stated as-is
  - label: Features, enhanced vs baseline
    value: 35 vs 18
    source: Stock Prediction Project Report Figs 1–2 — 17 sentiment features removed for baseline
  - label: Days of sentiment scored (IBM + KO)
    value: '667'
    source: sentiment_cache daily_sentiment_*.csv row counts (181+248+83+155)
  - label: Fewer API calls after refactor
    value: pending
    source: refactored codebase README (private repo) — pending verification
---

<!-- TODO(phil-voice) — §10 restructure notes (M6, agent-scaffolded; copy untouched):
     · "Approach" + "Architecture" now scaffold the Idea section — smooth the seam.
     · The metrics table now renders BELOW the write-up (§10 order), so "the
       accuracy cards above" and "it renders above as a pending card" in
       Result/Reflection point the wrong way — reword.
     · "This chapter spent weeks deliberately empty" (Result, first sentence)
       names the retired chapter deck — the document has sections now; reword.
     · Reflection is not a §10 section — fold into Result, keep, or cut. -->

## Problem

COS30018 Task C.7: predict stock price movement, and test whether news sentiment adds
signal beyond technical indicators. The design is a clean ablation — a baseline
classifier trained with sentiment features removed against an enhanced model with the
full set — plus a separate regression pipeline forecasting actual prices. The honest
question underneath: when the run is over, what can the code still prove?

## Idea

News comes from Alpha Vantage's NEWS_SENTIMENT feed (clients for Finnhub and NewsAPI
were written but never wired into the pipeline — capability, not usage). Each article's
title and summary are scored three ways — VADER, TextBlob, and FinBERT — joined by the
feed's own score, then averaged per day into an ensemble sentiment with its
disagreement spread. Every source-ticker-range fetch is cached to CSV, so re-runs skip
the network entirely. Feature engineering produces 35 features in the configured run:
OHLCV, eleven sentiment aggregates, seven technical indicators, nine lags, and three
interaction terms — sentiment × 10-day volatility, sentiment × log-volume, and a
sentiment-agreement score computed as the inverse of the tools' disagreement.

### Architecture

Two pipelines, deliberately separated — that separation *is* the refactor, receipted in
the git history: three standalone scripts collapsed into one argparse CLI
(collect-news → analyze-sentiment → train-models), the regression code split into its
own package, 630 lines added against 1,330 deleted. Classification wraps logistic
regression, random forest, and XGBoost behind one class with predict and predict_proba
semantics; splits are chronological and the scaler fits on training data only. The
regression side builds configurable LSTM/GRU stacks — default two GRU layers of 128
units reading 60-day windows to forecast five days — with a hybrid twist: a SARIMA model
fit on the network's training residuals, added back onto its forecast.

## Result

This chapter spent weeks deliberately empty: the pipeline demonstrably ran — 667
days of multi-tool sentiment for IBM and Coca-Cola sit in the caches with real
FinBERT scores — but every metric went to stdout and every plot to a window, so there
was nothing to cite. The receipt now exists: the submitted project report captures the
configured run in full. Baseline, trained on the 18 technical features left after
removing the 17 sentiment-related ones: F1 0.2222, direction accuracy 39.1%. Enhanced,
all 35 features: F1 0.5714, accuracy 47.8% — a +0.3492 F1 improvement, the report's
headline result. ROC AUC did not move: 0.3917 for both models, under the 0.5 coin-flip
line, reported as-is. Scale demands modesty too — 86 training samples, a 23-sample
test set (enhanced confusion matrix: TN 3, FP 5, FN 7, TP 8). The quieter, stronger
result is feature importance: sentiment features hold five of the top six slots —
ensemble_sentiment_lag_3, sentiment_agreement, both sentiment spreads, and
ensemble_sentiment itself — behind only Price_SMA_Ratio. One methodological flaw is
disclosed rather than hidden: the regression pipeline's early stopping monitored the
test set.

## Reflection

The lesson is epistemic: code that ran is not the same as results you can cite. The
accuracy cards above sat as em-dashes until the submitted report — the artifact that
actually captures the run — was retrieved; the numbers were always real, but for a
while nothing could prove them. Two resume-grade claims still carry the cautionary
half: an "sklearn-style interface" that actually trains with train(), not fit(), and a
"67% fewer API calls" refactor figure that no located document states — it renders
above as a pending card until the refactored codebase's README verifies it. What
survives the receipts: cache-first collectors that skip repeat calls entirely, a real
consolidation refactor (630 lines added against 1,330 deleted), and an experimental
design sound enough that its retrieved numbers say something modest and true. Still on
the fix list: log every run to disk, wire the two dormant news sources, and rerun the
ablation at a scale the tiny test set can't support today.
