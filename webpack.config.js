const path = require('path');
module.exports = {
    entry: './src/index.js',
    output: {
    path: path.resolve(__dirname, 'public'),
    publicPath: '',
    filename: 'main.js'
    },
    mode: 'development'
};