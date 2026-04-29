from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent
OUTPUT_FILE = PROJECT_ROOT / "report.txt"
TARGET_SUFFIXES = {".js", ".cpp", ".h"}
SKIP_FILES = {OUTPUT_FILE.name, Path(__file__).name}
SKIP_DIRS = {".git", ".tools", "node_modules", "build", "dist", "__pycache__"}


def iter_target_files(root: Path) -> list[Path]:
    files: list[Path] = []

    for path in root.rglob("*"):
        if not path.is_file():
            continue
        if any(part in SKIP_DIRS for part in path.relative_to(root).parts):
            continue
        if path.name in SKIP_FILES:
            continue
        if path.suffix.lower() not in TARGET_SUFFIXES:
            continue
        files.append(path)

    return sorted(files, key=lambda item: item.relative_to(root).as_posix())


def build_report(root: Path, files: list[Path]) -> str:
    sections: list[str] = []
    separator = "=" * 80

    for path in files:
        relative_path = path.relative_to(root).as_posix()
        content = path.read_text(encoding="utf-8", errors="replace").rstrip()
        sections.append(f"{relative_path}\n\n{content}")

    return f"\n{separator}\n\n" + f"\n\n{separator}\n\n".join(sections) + "\n"


def main() -> None:
    files = iter_target_files(PROJECT_ROOT)
    report = build_report(PROJECT_ROOT, files)
    OUTPUT_FILE.write_text(report, encoding="utf-8")
    print(f"Saved {len(files)} files to {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
