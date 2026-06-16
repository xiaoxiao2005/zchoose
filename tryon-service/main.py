# -*- coding: utf-8 -*-
"""
虚拟试衣服务：使用 FASHN VTON v1.5（云 API 或自建 FASHN_VTON_URL）。
提供 POST /generate 接口，body 中 model 固定为 "fashn-vton"。
"""
import os
import time
import tempfile
import base64
import logging
import binascii
import shutil
from pathlib import Path
from urllib.parse import urlparse

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

# 加载 .env（tryon-service 目录、当前目录、项目根目录）
_env_dir = Path(__file__).resolve().parent
load_dotenv(_env_dir / ".env")
load_dotenv(Path.cwd() / ".env")
load_dotenv(_env_dir.parent / ".env")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Try-On Service (FASHN VTON)")

def _env(key: str, default: str = "") -> str:
    v = (os.environ.get(key) or default).strip()
    if not v:
        for k, val in os.environ.items():
            if k.strip() == key and (val or "").strip():
                v = val.strip()
                break
    if v and v.startswith('"') and v.endswith('"'): v = v[1:-1]
    if v and v.startswith("'") and v.endswith("'"): v = v[1:-1]
    return v.strip() if v else ""

FASHN_API_KEY = _env("FASHN_API_KEY")
FASHN_API_BASE = _env("FASHN_API_BASE", "https://api.fashn.ai/v1")
FASHN_VTON_URL = _env("FASHN_VTON_URL")
RESULT_SAVE_DIR = Path(_env("TRYON_RESULT_DIR", r"D:\cursor\tryon-service\result")).resolve()

if not FASHN_API_KEY and not FASHN_VTON_URL:
    logger.warning("FASHN_API_KEY 与 FASHN_VTON_URL 均未配置，试衣生成将返回 501。请在 tryon-service/.env 中设置 FASHN_API_KEY=你的key")
else:
    logger.info("FASHN 已配置（云 API 或自建），可正常生成")


class GenerateRequest(BaseModel):
    personPhotoUrl: str
    outfitImageUrl: str | None = None
    prompt: str = ""
    height_cm: int | None = None
    weight_kg: int | None = None
    body_type_label: str | None = None
    gender: str | None = None
    model: str = "fashn-vton"


class GenerateResponse(BaseModel):
    front_url: str
    side_url: str
    back_url: str


def download_image(url: str, suffix: str = ".jpg") -> str:
    """下载图片到临时文件，返回本地路径。"""
    with httpx.Client(timeout=60.0) as client:
        r = client.get(url)
        r.raise_for_status()
        content = r.content
    path = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    path.write(content)
    path.close()
    return path.name


def image_to_data_url(path: str, mime: str = "image/png") -> str:
    """将本地图片转为 data URL。"""
    with open(path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode()
    return f"data:{mime};base64,{b64}"


def _url_to_fashn_image(url: str) -> str:
    """
    将图片 URL 转为 FASHN 可用的形式。
    - 已是 data URL：直接返回
    - localhost/127.0.0.1：本机可访问但云端不可访问，先下载再转 data URL
    - 其他：返回原 URL（公网可访问）
    """
    if not url or not url.strip():
        raise ValueError("图片 URL 为空")
    url = url.strip()
    if url.startswith("data:"):
        return url
    try:
        p = urlparse(url)
        host = (p.hostname or "").lower()
        if host in ("localhost", "127.0.0.1", "::1") or host.startswith("192.168.") or host.startswith("10."):
            path = download_image(url)
            try:
                ext = (Path(path).suffix or ".jpg").lower()
                mime = "image/png" if ext == ".png" else "image/jpeg"
                return image_to_data_url(path, mime)
            finally:
                try:
                    os.unlink(path)
                except Exception:
                    pass
    except Exception as e:
        logger.warning("下载本地图片失败 %s: %s", url, e)
        raise HTTPException(
            status_code=400,
            detail=f"无法加载图片（本地地址需由试衣服务代为下载）: {str(e)}",
        )
    return url


def _normalize_result_image(out_image) -> str:
    """将模型返回的图片转为 front_url 可用的字符串（URL 或 data URL）。"""
    if out_image is None:
        raise ValueError("未返回图片")
    if isinstance(out_image, str):
        if out_image.startswith("data:") or out_image.startswith("http://") or out_image.startswith("https://"):
            return out_image
        if os.path.isfile(out_image):
            return image_to_data_url(out_image)
        return out_image
    return image_to_data_url(str(out_image))


def _guess_ext_by_content_type(content_type: str) -> str:
    ct = (content_type or "").lower()
    if "png" in ct:
        return ".png"
    if "webp" in ct:
        return ".webp"
    if "jpeg" in ct or "jpg" in ct:
        return ".jpg"
    return ".jpg"


def _save_result_image(image_ref: str) -> Path:
    """
    将试衣结果图保存到本地目录，返回保存路径。
    支持 data URL、http(s) URL、本地文件路径。
    """
    RESULT_SAVE_DIR.mkdir(parents=True, exist_ok=True)
    ts = time.strftime("%Y%m%d-%H%M%S")
    file_stem = f"tryon-{ts}-{int(time.time() * 1000) % 1000:03d}"

    if image_ref.startswith("data:"):
        header, b64data = image_ref.split(",", 1)
        ext = ".png" if "image/png" in header else ".jpg"
        target = RESULT_SAVE_DIR / f"{file_stem}{ext}"
        try:
            target.write_bytes(base64.b64decode(b64data))
        except (ValueError, binascii.Error) as e:
            raise ValueError(f"data URL 解码失败: {e}") from e
        return target

    if image_ref.startswith("http://") or image_ref.startswith("https://"):
        with httpx.Client(timeout=60.0) as client:
            r = client.get(image_ref)
            r.raise_for_status()
            ext = _guess_ext_by_content_type(r.headers.get("Content-Type", ""))
            target = RESULT_SAVE_DIR / f"{file_stem}{ext}"
            target.write_bytes(r.content)
        return target

    if os.path.isfile(image_ref):
        ext = Path(image_ref).suffix or ".jpg"
        target = RESULT_SAVE_DIR / f"{file_stem}{ext}"
        shutil.copyfile(image_ref, target)
        return target

    raise ValueError("无法识别的结果图片格式")


def run_fashn_cloud(person_url: str, garment_url: str) -> str:
    """调用 FASHN 云 API (tryon-v1.6)，返回结果图 URL 或 data URL。"""
    if not FASHN_API_KEY:
        raise HTTPException(
            status_code=501,
            detail="FASHN VTON 需设置环境变量 FASHN_API_KEY（云 API）或 FASHN_VTON_URL（自建服务）",
        )
    headers = {"Content-Type": "application/json", "Authorization": f"Bearer {FASHN_API_KEY}"}
    with httpx.Client(timeout=120.0) as client:
        r = client.post(
            f"{FASHN_API_BASE}/run",
            json={
                "model_name": "tryon-v1.6",
                "inputs": {"model_image": person_url, "garment_image": garment_url},
            },
            headers=headers,
        )
        r.raise_for_status()
        data = r.json()
    pred_id = data.get("id")
    if not pred_id:
        raise HTTPException(status_code=502, detail="FASHN API 未返回 prediction id")
    for _ in range(60):
        time.sleep(3)
        r = httpx.get(f"{FASHN_API_BASE}/status/{pred_id}", headers=headers)
        r.raise_for_status()
        st = r.json()
        status = st.get("status", "")
        if status == "completed":
            out = st.get("output")
            if isinstance(out, dict) and out.get("image"):
                return out["image"]
            if isinstance(out, list) and len(out) > 0:
                return out[0] if isinstance(out[0], str) else out[0].get("url", "")
            if isinstance(out, str):
                return out
            raise HTTPException(status_code=502, detail="FASHN output 格式异常")
        if status in ("failed", "error", "cancelled"):
            raise HTTPException(status_code=502, detail=st.get("error", "FASHN 生成失败"))
    raise HTTPException(status_code=504, detail="FASHN 生成超时")


def run_fashn_self_hosted(person_url: str, garment_url: str) -> str:
    """调用自建 FASHN_VTON_URL 服务，POST 与当前 /generate 相同格式，返回 front_url。"""
    if not FASHN_VTON_URL:
        raise HTTPException(status_code=501, detail="未配置 FASHN_VTON_URL")
    with httpx.Client(timeout=120.0) as client:
        r = client.post(
            FASHN_VTON_URL.rstrip("/") + "/generate",
            json={
                "personPhotoUrl": person_url,
                "outfitImageUrl": garment_url,
                "model": "fashn-vton",
            },
        )
        r.raise_for_status()
        data = r.json()
    return data.get("front_url") or data.get("image_url") or ""


@app.post("/generate", response_model=GenerateResponse)
def generate(req: GenerateRequest):
    """接收人物照、搭配图，使用 FASHN VTON 生成试衣图。"""
    if not req.outfitImageUrl:
        raise HTTPException(status_code=400, detail="需要 outfitImageUrl（搭配图）")
    try:
        # localhost 等地址云端无法访问，先由本服务下载并转为 data URL 再交给 FASHN
        person_image = _url_to_fashn_image(req.personPhotoUrl)
        outfit_image = _url_to_fashn_image(req.outfitImageUrl)
        if FASHN_API_KEY:
            front_data = run_fashn_cloud(person_image, outfit_image)
        elif FASHN_VTON_URL:
            front_data = run_fashn_self_hosted(person_image, outfit_image)
        else:
            raise HTTPException(
                status_code=501,
                detail="FASHN VTON 需设置 FASHN_API_KEY 或 FASHN_VTON_URL",
            )
        saved_path = _save_result_image(front_data)
        logger.info("试衣结果已保存: %s", saved_path)
        return GenerateResponse(front_url=front_data, side_url=front_data, back_url=front_data)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("FASHN generate error")
        raise HTTPException(status_code=502, detail=f"FASHN 试衣生成失败: {str(e)}")


@app.get("/health")
def health():
    return {"status": "ok", "models": ["fashn-vton"]}


@app.get("/models")
def list_models():
    """返回可用模型列表，供前端下拉使用。"""
    return {"models": [{"id": "fashn-vton", "name": "FASHN VTON v1.5", "desc": "像素空间生成，支持云 API 或自建"}]}


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
