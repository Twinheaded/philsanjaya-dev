---
title: Market sentiment
slug: market-sentiment
order: 3
tags: [machine-learning, nlp]
stack: [Python, TensorFlow/Keras, scikit-learn, XGBoost, FinBERT]
period: '2025'
summary: Multi-tool news sentiment meets stock prediction, with results held to receipts
question: Does news sentiment add predictive signal beyond technical indicators?
status: published
metrics:
  - label: Direction accuracy, enhanced model
    value: pending
    source: submitted COS30018 report — no run artifacts exist in the code archive
  - label: Days of sentiment scored (IBM + KO)
    value: '667'
    source: sentiment_cache daily_sentiment_*.csv row counts (181+248+83+155)
  - label: Refactor net line change
    value: '−700'
    source: git show --stat 40473f5 (+630 / −1330, 13 files)
---

## Problem

COS30018 Task C.7: predict stock price movement, and test whether news sentiment adds
signal beyond technical indicators. The design is a clean ablation — a baseline
classifier trained with sentiment features removed against an enhanced model with the
full set — plus a separate regression pipeline forecasting actual prices. The honest
question underneath: when the run is over, what can the code still prove?

## Approach

News comes from Alpha Vantage's NEWS_SENTIMENT feed (clients for Finnhub and NewsAPI
were written but never wired into the pipeline — capability, not usage). Each article's
title and summary are scored three ways — VADER, TextBlob, and FinBERT — joined by the
feed's own score, then averaged per trading day into an ensemble sentiment with its
disagreement spread. Every source-ticker-range fetch is cached to CSV, so re-runs skip
the network entirely. Feature engineering produces 35 features in the configured run:
OHLCV, eleven sentiment aggregates, seven technical indicators, nine lags, and three
interaction terms — sentiment × 10-day volatility, sentiment × log-volume, and a
sentiment-agreement score computed as the inverse of the tools' disagreement.

## Architecture

Two pipelines, deliberately separated — that separation *is* the refactor, receipted in
the git history: three standalone scripts collapsed into one argparse CLI
(collect-news → analyze-sentiment → train-models), the regression code split into its
own package, 630 lines added against 1,330 deleted. Classification wraps logistic
regression, random forest, and XGBoost behind one class with predict and predict_proba
semantics; splits are chronological and the scaler fits on training data only. The
regression side builds configurable LSTM/GRU stacks — default two GRU layers of 128
units reading 60-day windows to forecast five days — with a hybrid twist: a SARIMA model
fit on the network's training residuals, added back onto its forecast.

## Results

This chapter is deliberately empty of accuracy numbers, and that is the finding. The
pipeline demonstrably ran — 667 trading days of multi-tool sentiment for IBM and
Coca-Cola sit in the caches with real FinBERT scores — and the ablation harness prints
ΔF1 and ΔAUC against a 0.01 significance bar. But nothing saved them: every metric went
to stdout, every plot to a window. The only numbers in the archive live in an
AI-assisted analysis document that cites an experiment absent from the config — so under
this site's rules they are not results, and the accuracy card above stays an em-dash
until the submitted report is retrieved. One methodological flaw is disclosed rather
than hidden: the regression pipeline's early stopping monitored the test set.

## Reflection

The lesson is epistemic: code that ran is not the same as results you can cite. Two
claims I would once have put on a resume died under verification — a "67% fewer API
calls" figure that appears nowhere in the history, and an "sklearn-style interface"
that trains with train(), not fit(). What survives is what the receipts support:
cache-first collectors that skip repeat calls entirely, a real consolidation refactor,
and a sound experimental design whose outputs were never persisted. The fix list writes
itself: log every run to disk, wire the two dormant news sources, rerun the ablation,
and backfill the pending card with a number that can defend itself.
