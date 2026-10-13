from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from simulation.simulator import run_simulation
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title='QoS Traffic Manager', version='1.0')

app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

@app.get('/health')
async def health():
    return JSONResponse({'status': 'ok', 'service': 'QoS Traffic Manager Backend'})

@app.websocket('/ws/simulate')
async def simulate(websocket: WebSocket):
    await websocket.accept()
    logger.info('WebSocket connection accepted')
    try:
        config = await websocket.receive_json()
        logger.info(f'Received config: {config}')
        
        # Validate config
        required = ['seed', 'load_profile', 'link_mbps', 'buffer_limit', 'prop_delay_ms', 'duration_ms']
        for key in required:
            if key not in config:
                await websocket.send_json({'type': 'error', 'message': f'Missing config key: {key}'})
                await websocket.close()
                return
        
        await run_simulation(config, websocket)
        
    except WebSocketDisconnect:
        logger.info('WebSocket disconnected')
    except Exception as e:
        logger.error(f'Simulation error: {e}', exc_info=True)
        try:
            await websocket.send_json({'type': 'error', 'message': str(e)})
        except:
            pass
    finally:
        try:
            await websocket.close()
        except:
            pass
