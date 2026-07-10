from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


BASE_DIR = Path(__file__).resolve().parent
SRC = BASE_DIR.parents[2] / "541158496-ad2de754-e6f5-44d2-9c53-80a20144bcb4.jpg"
OUT = BASE_DIR / "service-architecture-ko.jpg"
FONT = "/System/Library/Fonts/AppleSDGothicNeo.ttc"


def font(size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT, size=size, index=0)


def label(
    draw: ImageDraw.ImageDraw,
    xy: tuple[int, int],
    text: str,
    size: int = 34,
    anchor: str = "mm",
) -> None:
    draw.multiline_text(
        xy,
        text,
        font=font(size),
        fill=(15, 23, 42),
        anchor=anchor,
        align="center",
        spacing=6,
        stroke_width=5,
        stroke_fill=(255, 255, 255),
    )


def main() -> None:
    image = Image.open(SRC).convert("RGB")
    draw = ImageDraw.Draw(image)

    labels = [
        ((165, 700), "화면\n요청/응답", 30),
        ((640, 300), "자동 배포", 30),
        ((710, 715), "API 요청", 30),
        ((1020, 705), "API 라우팅", 30),
        ((1195, 325), "DB 저장/조회", 30),
        ((1110, 1110), "검색 색인/조회", 30),
        ((1525, 715), "큐 등록", 30),
        ((1755, 715), "비동기 처리", 30),
        ((2215, 725), "프롬프트 변환", 30),
        ((1770, 1030), "음악 생성 요청", 30),
        ((1850, 190), "파일 저장", 30),
    ]

    for xy, text, size in labels:
        label(draw, xy, text, size)

    image.save(OUT, quality=95)


if __name__ == "__main__":
    main()
