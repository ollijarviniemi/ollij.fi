defaultpen(fontsize (10pt));
usepackage("amsmath");
usepackage("amssymb");
settings.tex="latex";
settings.outformat="pdf";
size (15cm);


real s = 1;
void sq(real x, real y) {
	filldraw((x, y)--(x+s, y)--(x+s, y+s)--(x, y+s)--cycle, red);
}


real x = 50;
real h = 5;
real w = 20;

draw((w/2, 0)--(w/2, h));
draw((0, h)--(w, h));

draw((x-w/2, 0)--(x-w/2, h));
draw((x-w, h)--(x, h));

label((w/2, -0.7), "Rasitus");
label((w/2, -1.8), scale(0.55)*"(80 palikkaa)");
label((x - w/2, -0.7), "Muu syy");
label((x - w/2, -1.8), scale(0.55)*"(20 palikkaa)");

label((w/4, h*0.9), scale(0.8)*"vahva = vasen");
label((w/4, h*0.7), scale(0.55)*"(80 palikkaa)");
label((w/4, h*0.55), scale(0.5)*"(100\% selityksen palikoista)");

label((3*w/4, h*0.9), scale(0.8)*"vahva = oikea");
label((3*w/4, h*0.7), scale(0.55)*"(0 palikkaa)");
label((3*w/4, h*0.55), scale(0.5)*"(0\% selityksen palikoista)");

label((x - 3*w/4, h*0.9), scale(0.8)*"vahva = vasen");
label((x - 3*w/4, h*0.7), scale(0.55)*"(10 palikkaa)");
label((x - 3*w/4, h*0.55), scale(0.5)*"(50\% selityksen palikoista)");
label((x - w/4, h*0.9), scale(0.8)*"vahva = oikea");
label((x - w/4, h*0.7), scale(0.55)*"(10 palikkaa)");
label((x - w/4, h*0.55), scale(0.5)*"(50\% selityksen palikoista)");

for(int t = 0; t <= 1; ++t) {
	for(int y = 1; y <= 2; ++y) {
		for(int k = 1; k <= 5; ++k) {
			sq(x - w + 1.5 + k + w*t/2, h + y - 1);
		}
	}
}



for(int y = 1; y <= 8; ++y) {
	for(int k = 1; k <= 10; ++k) {
		sq(k-1, h + y - 1);
	}
}


