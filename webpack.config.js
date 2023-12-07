const path = require('path');
const webpack = require('webpack')
const CopyPlugin = require('copy-webpack-plugin');
const fs = require('fs').promises;
const crypto = require('crypto');

module.exports = {
	module: {
		rules: [
			{
				test: /\.less$/,
				use: [
					'style-loader',
					'css-loader',
					'less-loader'
				]
			},
			{
				test: /\.(svg|eot|woff|woff2|ttf)$/,
				use: {
					loader: 'file-loader',
					options: {
						name: '[name].[ext]'
					}
				}
			}
		]
	},
	resolve: {
        fallback: {
            //assert: require.resolve('assert'),
            //crypto: require.resolve('crypto-browserify'),
           // http: require.resolve('stream-http'),
            //https: require.resolve('https-browserify'),
            //os: require.resolve('os-browserify/browser'),
            "stream": require.resolve('stream-browserify'),
			"zlib": require.resolve("browserify-zlib"),
			"path": require.resolve("path-browserify"),
			"crypto": require.resolve("crypto-browserify"),
			"buffer": require.resolve("buffer/"),
			"util": require.resolve("util/"),
			"assert": require.resolve("assert/")
        },
    },
	entry: './src/index.js',
	output: {
		path: path.resolve(__dirname, 'dist'),
		filename: 'out.js'
	},
	devServer: {
		port: 12345,
		static: './res'
	},
	mode: 'development',
	plugins: [
		new CopyPlugin({
			patterns: [
				{from: 'res', to: '.'}
			]
		}),
		{
			apply(compiler) {
				compiler.hooks.afterEmit.tapPromise('asc', async (compilation) => {
					// this will break if directories are used inside the dist thingy so uh dont or fix this.
					let dir = path.resolve(__dirname, 'dist');
					let files = await fs.readdir(dir);
					let out_json = [];
					for(let file of files) {
						if(file == "appfiles.json" || file == "sw.js") continue;
						let hash = crypto.createHash('sha1').update(await fs.readFile(path.resolve(dir, file))).digest('hex')
						out_json.push([
							file, hash
						]);
					}
					await fs.writeFile(path.resolve(dir, "appfiles.json"), JSON.stringify(out_json), "utf8");
				});
			}
		},
		new webpack.ProvidePlugin({
			process: 'process/browser',
		  }),
		  new webpack.ProvidePlugin({
            Buffer: ['buffer', 'Buffer'],
        }),
	]
};