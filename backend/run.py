import uvicorn

if __name__ == '__main__':
    uvicorn.run(
        'main:app',
        host='0.0.0.0',
        port=8000,
        reload=True,
        log_level='info',
        ws_max_size=33_554_432,  # 32 MB — handles large packet trace payloads
    )
