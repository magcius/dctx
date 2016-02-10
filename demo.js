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

    var DEZIGZAG = [
         0,  1,  8, 16,  9,  2,  3, 10,
        17, 24, 32, 25, 18, 11,  4,  5,
        12, 19, 26, 33, 40, 48, 41, 34,
        27, 20, 13,  6,  7, 14, 21, 28,
        35, 42, 49, 56, 57, 50, 43, 36,
        29, 22, 15, 23, 30, 37, 44, 51,
        58, 59, 52, 45, 38, 31, 39, 46,
    	53, 60, 61, 54, 47, 55, 62, 63,
    ];
    var ZIGZAG = new Array(DEZIGZAG.length);
    for (var i = 0; i < ZIGZAG.length; i++)
        ZIGZAG[DEZIGZAG[i]] = i;

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

    function quantize(n, divisor) {
        return ((n / divisor) | 0) * divisor;
    }

    function idct(pixels, coeffs, divisor, coeffLimit) {
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

                        var coefIdx = ky*N+kx;
                        if (ZIGZAG[coefIdx] >= coeffLimit)
                            break;

                        // The DCT-II requires that our basis functions are
                        // increase in frequency in quarter-length increments.
                        var freqX = (kx * TAU * (1/4));
                        var freqY = (ky * TAU * (1/4));

                        // ... and that we use odds as our harmonics, like this.
                        var harmonicX = Math.cos((2*x+1) / N * freqX);
                        var harmonicY = Math.cos((2*y+1) / N * freqY);

                        var coef = coeffs[coefIdx];
                        coef = quantize(coef, divisor);
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
    function blocksToImgData(imgData, blocks, divisor, coeffLimit) {
        if (!divisor) divisor = 1;
        if (!coeffLimit) coeffLimit = 64;

        var nBlocksPerRow = (imgData.width / BLOCK_SIZE) | 0;
        blocks.forEach(function(block, i) {
            var by = ((i / nBlocksPerRow) | 0) * BLOCK_SIZE;
            var bx = ((i % nBlocksPerRow) | 0) * BLOCK_SIZE;

            var imgBoff = by*imgData.width+bx;
            for (var y = 0; y < BLOCK_SIZE; y++) {
                for (var x = 0; x < BLOCK_SIZE; x++) {
                    var blockOff = y*BLOCK_SIZE+x;
                    var imgOff = y*imgData.width+x;
                    var data = block[blockOff];
                    data = quantize(data, divisor);
                    if (ZIGZAG[blockOff] >= coeffLimit)
                        data = 0;
                    imgData.data[(imgBoff+imgOff)*4+0] = data;
                    imgData.data[(imgBoff+imgOff)*4+1] = data;
                    imgData.data[(imgBoff+imgOff)*4+2] = data;
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
        var currCoeffLimit = 64;

        function redisplay() {
            if (showCoeffs) {
                blocksToImgData(imgData, coeffBlocks, currDivisor, currCoeffLimit);
            } else {
                for (var i = 0; i < pixelBlocks.length; i++)
                    idct(pixelBlocks[i], coeffBlocks[i], currDivisor, currCoeffLimit);
                blocksToImgData(imgData, pixelBlocks);
            }
            ctx.putImageData(imgData, 0, 0);
        }

        imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        var divisorslider = document.querySelector('#divisorinput');
        divisorslider.value = currDivisor;
        divisorslider.oninput = function() {
            document.querySelector('#divisordisp').textContent = this.value;
        };
        divisorslider.onchange = function() {
            currDivisor = this.value;
            redisplay();
        };
        var coefflimitslider = document.querySelector('#coefflimitinput');
        coefflimitslider.value = currCoeffLimit;
        coefflimitslider.oninput = function() {
            document.querySelector('#coefflimitdisp').textContent = this.value;
        };
        coefflimitslider.onchange = function() {
            currCoeffLimit = this.value;
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
