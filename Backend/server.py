from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from werkzeug.utils import secure_filename
import os, datetime, mimetypes

app = Flask(__name__)
CORS(app)

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), '..', 'Uploads')
MAX_MB     = 10
ALLOWED    = {'png','jpg','jpeg','gif','pdf','txt','doc','docx','mp4','zip','csv','xlsx'}

os.makedirs(UPLOAD_DIR, exist_ok=True)

def allowed(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED

def file_info(filename):
    path = os.path.join(UPLOAD_DIR, filename)
    size = os.path.getsize(path)
    mime = mimetypes.guess_type(filename)[0] or 'application/octet-stream'
    modified = datetime.datetime.fromtimestamp(os.path.getmtime(path)).isoformat()
    return {'name': filename, 'size': size, 'type': mime, 'uploaded_at': modified}

# ── Upload ────────────────────────────────────────────────────
@app.route('/upload', methods=['POST'])
def upload():
    files = request.files.getlist('files')
    if not files:
        return jsonify({'error': 'No files provided'}), 400

    results = []
    for file in files:
        if not file or not file.filename:
            continue
        if not allowed(file.filename):
            results.append({'name': file.filename, 'error': 'File type not allowed'})
            continue
        filename = secure_filename(file.filename)
        # Avoid overwrite: prefix timestamp if exists
        if os.path.exists(os.path.join(UPLOAD_DIR, filename)):
            ts = int(datetime.datetime.now().timestamp())
            name, ext = os.path.splitext(filename)
            filename = f"{name}_{ts}{ext}"
        path = os.path.join(UPLOAD_DIR, filename)
        file.save(path)
        if os.path.getsize(path) > MAX_MB * 1024 * 1024:
            os.remove(path)
            results.append({'name': file.filename, 'error': f'Exceeds {MAX_MB}MB limit'})
            continue
        results.append({'name': filename, 'success': True, **file_info(filename)})

    return jsonify(results)

# ── List files ────────────────────────────────────────────────
@app.route('/files', methods=['GET'])
def list_files():
    files = [
        file_info(f) for f in os.listdir(UPLOAD_DIR)
        if os.path.isfile(os.path.join(UPLOAD_DIR, f))
    ]
    files.sort(key=lambda x: x['uploaded_at'], reverse=True)
    return jsonify(files)

# ── Download ──────────────────────────────────────────────────
@app.route('/files/<filename>', methods=['GET'])
def download(filename):
    return send_from_directory(UPLOAD_DIR, filename, as_attachment=True)

# ── Delete ────────────────────────────────────────────────────
@app.route('/files/<filename>', methods=['DELETE'])
def delete(filename):
    path = os.path.join(UPLOAD_DIR, secure_filename(filename))
    if os.path.exists(path):
        os.remove(path)
        return jsonify({'message': 'Deleted'})
    return jsonify({'error': 'File not found'}), 404

if __name__ == '__main__':
    app.run(debug=True, port=5000)
