from __future__ import annotations

import json
from pathlib import Path


DATA_PATH = Path(__file__).resolve().parents[1] / "data" / "wm811k_evaluation_fixture.json"


def wm811k_evaluation_report() -> dict[str, object]:
    fixture = _load_fixture()
    classes = list(fixture["classes"])
    confusion_rows: dict[str, list[int]] = fixture["confusion_rows"]
    critical_classes = set(fixture["critical_classes"])

    row_totals = {label: sum(confusion_rows[label]) for label in classes}
    col_totals = _column_totals(classes, confusion_rows)
    total = sum(row_totals.values())
    correct = sum(confusion_rows[label][classes.index(label)] for label in classes)
    per_class = [
        _class_metric(label, row_totals[label], col_totals[label], classes, confusion_rows, critical_classes)
        for label in classes
    ]
    critical_total = sum(row_totals[label] for label in critical_classes)
    critical_exact = sum(confusion_rows[label][classes.index(label)] for label in critical_classes)
    critical_missed_as_normal = sum(confusion_rows[label][classes.index("None")] for label in critical_classes)

    return {
        "dataset": {
            **fixture["dataset"],
            "sample_count": total,
            "class_count": len(classes),
            "minority_class": min(row_totals, key=row_totals.get),
            "majority_class": max(row_totals, key=row_totals.get),
            "imbalance_ratio": round(max(row_totals.values()) / min(row_totals.values()), 1),
        },
        "summary": {
            "overall_accuracy": round(correct / total, 4),
            "macro_f1": round(sum(item["f1"] for item in per_class) / len(per_class), 4),
            "critical_exact_recall": round(critical_exact / critical_total, 4),
            "critical_missed_as_normal": critical_missed_as_normal,
            "critical_detection_rate": round((critical_total - critical_missed_as_normal) / critical_total, 4),
            "headline": "정확도보다 critical defect의 미검출과 오분류 후속 조치가 더 중요한 운영 리스크입니다.",
        },
        "classes": classes,
        "per_class": per_class,
        "confusion_matrix": {
            "labels": classes,
            "rows": [
                {
                    "actual": label,
                    "support": row_totals[label],
                    "cells": [
                        {
                            "predicted": predicted,
                            "count": confusion_rows[label][index],
                            "rate": round(confusion_rows[label][index] / row_totals[label], 4),
                            "correct": label == predicted,
                        }
                        for index, predicted in enumerate(classes)
                    ],
                }
                for label in classes
            ],
        },
        "critical_misses": _critical_misses(fixture, classes, confusion_rows),
        "imbalance_response": fixture["imbalance_response"],
        "drift_scenarios": fixture["drift_scenarios"],
        "grad_cam_evidence": fixture["grad_cam_evidence"],
        "quality_risk_explanations": fixture["quality_risk_explanations"],
    }


def _load_fixture() -> dict[str, object]:
    with DATA_PATH.open("r", encoding="utf-8") as file:
        return json.load(file)


def _column_totals(classes: list[str], confusion_rows: dict[str, list[int]]) -> dict[str, int]:
    totals = dict.fromkeys(classes, 0)
    for row in confusion_rows.values():
        for index, count in enumerate(row):
            totals[classes[index]] += count
    return totals


def _class_metric(
    label: str,
    support: int,
    predicted_total: int,
    classes: list[str],
    confusion_rows: dict[str, list[int]],
    critical_classes: set[str],
) -> dict[str, object]:
    true_positive = confusion_rows[label][classes.index(label)]
    precision = true_positive / predicted_total if predicted_total else 0.0
    recall = true_positive / support if support else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    return {
        "class_name": label,
        "support": support,
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1": round(f1, 4),
        "risk_role": "critical" if label in critical_classes else "monitor",
    }


def _critical_misses(
    fixture: dict[str, object],
    classes: list[str],
    confusion_rows: dict[str, list[int]],
) -> list[dict[str, object]]:
    misses = []
    for item in fixture["critical_misses"]:
        actual = item["actual"]
        predicted = item["predicted"]
        misses.append(
            {
                **item,
                "count": confusion_rows[actual][classes.index(predicted)],
            }
        )
    return misses
