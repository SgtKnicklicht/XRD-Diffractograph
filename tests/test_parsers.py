from pathlib import Path
import sys


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from server import detect_and_parse, parse_semicolon_csv, parse_xy_text  # noqa: E402


def test_parse_xy_text_skips_headers_and_comments():
    xs, ys = parse_xy_text(
        """
        # exported data
        2theta intensity
        10.0 100
        10.5, 120
        11.0\t130\tignored
        """
    )

    assert xs == [10.0, 10.5, 11.0]
    assert ys == [100.0, 120.0, 130.0]


def test_parse_semicolon_csv_european_decimal_format():
    xs, ys = parse_semicolon_csv("10,25;100,5\n11,00;120,0\n")

    assert xs == [10.25, 11.0]
    assert ys == [100.5, 120.0]


def test_detect_pks_as_reference_peak_list():
    content = b"""
    Pks_Example
    4.12 21.55 100.0 1000 42 0.12
    2.71 33.08 40.0 400 18 0.14
    """

    xs, ys, fmt, is_reference = detect_and_parse("reference.pks", content)

    assert xs == [21.55, 33.08]
    assert ys == [100.0, 40.0]
    assert fmt == "pks"
    assert is_reference is True
