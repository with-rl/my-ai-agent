FROM python:3.12.11

RUN apt-get update && apt-get install -y curl

RUN python -m venv /opt/venv/
ENV PATH=/opt/venv/bin:$PATH

WORKDIR /app

COPY ../requirements.txt /tmp/requirements.txt
RUN pip install -r /tmp/requirements.txt

COPY ./src .

# Set PYTHONPATH to include the current directory
ENV PYTHONPATH=/app:$PYTHONPATH

EXPOSE 80

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "80"]
