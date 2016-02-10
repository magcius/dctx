(function(exports) {
    "use strict";

    var BLOCK_SIZE = 8;

    function loadImg(src, cb) {
        var img = document.createElement('img');
        img.src = src;
        img.onload = function() {
            cb(img);
        };
    }

    var TAU = Math.PI * 2;

    function dct(pixels, coeffs) {
        var N = 8;
        var tmp = new Float32Array(8);

        function dct_1d(dst, src, offset, stride) {
            for (var i = 0; i < N; i++) {
                var sum = 0;

                for (var j = 0; j < N; j++) {
                    var theta = (2*j+1) / N;
                    var pixel = src[offset + j * stride];
                    sum += pixel * Math.cos(Math.PI * i * (2*j+1) / (2*N));
                }

                if (i == 0)
                    sum /= Math.sqrt(2) * 2;
                else
                    sum /= 2;

                tmp[i] = sum;
            }

            for (var i = 0; i < N; i++)
                dst[offset + i * stride] = tmp[i];
        }

        var i;

        // rows
        for (i = 0; i < N; i++)
            dct_1d(coeffs, pixels, N * i, 1);

        // columns
        for (i = 0; i < N; i++)
            dct_1d(coeffs, coeffs, i, N);
    }

    function idct(pixels, coeffs, divisor) {
        var x, y;
        var N = 8;

        for (y = 0; y < N; y++) {
            for (x = 0; x < N; x++) {
                // We start with all pixel values having the DC offset.
                // XXX -- figure out what the divide by two is for. Probably
                // related to the divide by sqrt(2), as we have kx=0 and ky=0,
                // so it's effectively coeffs[0]/(sqrt(2)*sqrt(2)).
                var pix = coeffs[0] / 2.0;

                // The rest are AC frequency coefficients; sum them up one
                // at a time.
                for (var ky = 0; ky < N; ky++) {
                    for (var kx = 0; kx < N; kx++) {
                        // Skip the DC offset as it's already been added above.
                        if (kx == 0 && ky == 0)
                            continue;

                        // The DCT-II requires that our basis functions are
                        // increase in frequency in quarter-length increments.
                        var freqX = (kx * TAU * (1/4));
                        var freqY = (ky * TAU * (1/4));

                        // ... and that we use odds as our harmonics, like this.
                        var harmonicX = Math.cos((2*x+1) / N * freqX);
                        var harmonicY = Math.cos((2*y+1) / N * freqY);

                        var coef = coeffs[ky*N+kx];
                        coef = coef / divisor;
                        var weightedHarmonic = coef * harmonicX * harmonicY;

                        // XXX -- figure out what this is here for; seems arbitrary,
                        // but we get bad edge discontinuities without it.
                        if (kx == 0 || ky == 0)
                            weightedHarmonic /= Math.sqrt(2);

                        pix += weightedHarmonic;
                    }
                }

                // XXX -- figure out what this division is for. Is it related
                // to the 1/4 frequency increment in the harmonics above?
                pix /= 4;
                if (pix > 255)
                    pix = 255;
                if (pix < 0)
                    pix = 0;
                pixels[y*N+x] = pix;
            }
        }
    }

    function blocksFromImgData(imgData) {
        var blocks = [];
        for (var by = 0; by < imgData.height; by += BLOCK_SIZE) {
            for (var bx = 0; bx < imgData.width; bx += BLOCK_SIZE) {
                var block = new Uint8Array(BLOCK_SIZE * BLOCK_SIZE);
                var imgBoff = by*imgData.width+bx;
                for (var y = 0; y < BLOCK_SIZE; y++) {
                    for (var x = 0; x < BLOCK_SIZE; x++) {
                        var blockOff = y*BLOCK_SIZE+x;
                        var imgOff = y*imgData.width+x;
                        block[blockOff] = imgData.data[(imgBoff+imgOff)*4];
                    }
                }
                blocks.push(block);
            }
        }
        return blocks;
    }
    function blocksToImgData(imgData, blocks, divisor) {
        if (!divisor) divisor = 1;
        var nBlocksPerRow = (imgData.width / BLOCK_SIZE) | 0;
        blocks.forEach(function(block, i) {
            var by = ((i / nBlocksPerRow) | 0) * BLOCK_SIZE;
            var bx = ((i % nBlocksPerRow) | 0) * BLOCK_SIZE;

            var imgBoff = by*imgData.width+bx;
            for (var y = 0; y < BLOCK_SIZE; y++) {
                for (var x = 0; x < BLOCK_SIZE; x++) {
                    var blockOff = y*BLOCK_SIZE+x;
                    var imgOff = y*imgData.width+x;
                    imgData.data[(imgBoff+imgOff)*4+0] = block[blockOff] / divisor;
                    imgData.data[(imgBoff+imgOff)*4+1] = block[blockOff] / divisor;
                    imgData.data[(imgBoff+imgOff)*4+2] = block[blockOff] / divisor;
                    imgData.data[(imgBoff+imgOff)*4+3] = 0xFF;
                }
            }
        });
    }

    function imgLoaded(img) {
        var canvas = document.querySelector('canvas');
        canvas.width = img.width;
        canvas.height = img.height;

        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        var imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        var pixelBlocks = blocksFromImgData(imgData);

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        var coeffBlocks = [];
        pixelBlocks.forEach(function(pixels) {
            var coeffs = new Float32Array(pixels.length);
            dct(pixels, coeffs);
            coeffBlocks.push(coeffs);
        });

        var currDivisor = 1;
        var showCoeffs = false;

        function redisplay() {
            if (showCoeffs) {
                blocksToImgData(imgData, coeffBlocks, currDivisor);
            } else {
                for (var i = 0; i < pixelBlocks.length; i++) {
                    idct(pixelBlocks[i], coeffBlocks[i], currDivisor);
                }
                blocksToImgData(imgData, pixelBlocks);
            }
            ctx.putImageData(imgData, 0, 0);
        }

        imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        var slider = document.querySelector('#divisorinput');
        slider.value = currDivisor;
        slider.oninput = function() {
            document.querySelector('#divisordisp').textContent = slider.value;
        };
        slider.onchange = function() {
            currDivisor = slider.value;
            redisplay();
        };
        document.querySelector('#showcoeffs').onchange = function() {
            showCoeffs = this.checked;
            redisplay();
        };
        redisplay();
    }

    window.onload = function() {
        loadImg('lena.jpg', imgLoaded);
    };

})(window);
