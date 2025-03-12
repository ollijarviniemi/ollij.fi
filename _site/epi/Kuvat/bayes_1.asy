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


real x = 40;
real h = 5;
real w = 15;

draw((w/2, 0)--(w/2, h));
draw((0, h)--(w, h));

draw((x-w/2, 0)--(x-w/2, h));
draw((x-w, h)--(x, h));

label((w/2, -1), "Rasitus");
label((x - w/2, -1), "Muu syy");

label((w/4, h*0.9), scale(0.8)*"vahva = vasen");
label((3*w/4, h*0.9), scale(0.8)*"vahva = oikea");

label((x - 3*w/4, h*0.9), scale(0.8)*"vahva = vasen");
label((x - w/4, h*0.9), scale(0.8)*"vahva = oikea");


sq(x - w + s, h);
sq(x - w + 2.5*s, h);
sq(x - w + 4*s, h);
sq(x - w + 5.5*s, h);

sq(x - w + s + s*0.75, h+s);
sq(x - w + s + s*2.25, h+s);
sq(x - w + s + s*3.75, h+s);

sq(x - w + 2.5*s, h+2*s);
sq(x - w + 4*s, h+2*s);

sq(x - w + s + s*2.25, h+3*s);


x += w/2;

sq(x - w + s, h);
sq(x - w + 2.5*s, h);
sq(x - w + 4*s, h);
sq(x - w + 5.5*s, h);

sq(x - w + s + s*0.75, h+s);
sq(x - w + s + s*2.25, h+s);
sq(x - w + s + s*3.75, h+s);

sq(x - w + 2.5*s, h+2*s);
sq(x - w + 4*s, h+2*s);

sq(x - w + s + s*2.25, h+3*s);

x -= w/2;