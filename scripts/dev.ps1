Set-Location "$PSScriptRoot\.."
Start-Process powershell -ArgumentList "-NoExit","-Command","cd backend; .\.venv\Scripts\uvicorn app.main:app --reload --port 8000"
Set-Location frontend; npm run dev
