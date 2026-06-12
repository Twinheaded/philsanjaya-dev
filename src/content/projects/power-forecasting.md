---
title: Power forecasting
slug: power-forecasting
order: 4
tags: [machine-learning, data-science]
stack: [Python, scikit-learn, TensorFlow/Keras, pandas]
period: '2026'
summary: A neural net, an MLP, and a Random Forest meet honest tabular data
question: Why did a Random Forest beat the neural network — and why was that expected?
status: published
metrics:
  - label: Random Forest, test R²
    value: '0.9779'
    source: notebook cell 18 output; models/comparison_metrics.csv
  - label: Best ANN (batch 16), test R²
    value: '0.7477'
    source: notebook cell 44 output; comparison_metrics.csv
  - label: Margin over second-best (MLP)
    value: '0.10 R²'
    source: notebook cell 53 — R² advantage over MLP 0.1016
---

## Problem

COS40007 Portfolio Assessment 3: predict Zone 1 power consumption for Tetouan City —
52,416 readings at ten-minute intervals across all of 2017, zero missing values — from
weather and engineered time features. One deliberate choice shaped the task: the other
two zones' consumption columns were dropped as leakage (they correlate with Zone 1 at
0.83 and 0.75), so the models had to earn their accuracy from nine honest features
rather than copy a neighbouring meter.

## Approach

Three models on an identical 80/20 chronologically-prepared split with a
train-fit-only scaler: a 200-tree Random Forest, a scikit-learn MLP (64, 32), and a
Keras network — 64 → 32 → 16 with dropout after the first two layers, 3,265 parameters
in total — swept across batch sizes 16, 32, and 64. The sweep was real, not decorative:
batch 16 won (R² 0.7477 over 0.7288 and 0.7348), consistent with smaller batches'
noisier gradients acting as implicit regularisation.

## Results

The Random Forest won, and it wasn't close: test R² 0.9779 (RMSE 1,056.55, MAE 706.47,
five-fold CV 0.9745 ± 0.0013) against the best ANN's 0.7477 — a 0.23 R² gap — with the
MLP between them at 0.8763. Every neural variant lost to the forest. The report says so
plainly and the notebook outputs back every digit; the metric cards above cite the
exact cells.

## Reflection

This is the case study about losing well. The result was *expected*: on
medium-sized tabular data, recursive partitioning captures non-linear feature
interactions and integer-encoded time features natively, while a 3,265-parameter
network simply lacks the capacity — and bagging 200 independent trees reduces variance
more effectively than two dropout layers ever could (the report grounds this in
Grinsztajn et al. 2022, "Why do tree-based models still outperform deep learning on
tabular data?"). Choosing the boring model that wins over the exciting model that
loses is the engineering judgement this assessment was actually testing. One flaw is
acknowledged rather than polished away: the dataset is cited only informally
("sourced from Kaggle"), without the original authors — a citation habit worth fixing.
