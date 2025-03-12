include  "/home/olli/olympiad";
include  "/home/olli/cse5";
defaultpen(fontsize (10pt));
usepackage("amsmath");
usepackage("amssymb");
settings.tex="latex";
settings.outformat="pdf";
size (4cm);


real s = 6;

pair O = (0, 0);
pair X1 = (-1, 0);
pair X2 = (s, 0);
pair Y1 = (0, -1);
pair Y2 = (0, s);
draw(X1 -- X2,arrow=Arrow(TeXHead));
draw(Y1 -- Y2, arrow=Arrow(TeXHead));

pair CC = (4, 4);
pair CD = (1, 5);
pair DC = (5, 1);
pair DD = (2, 2);

dot(scale(0.7)*"EE", CC, dir(CC));
dot(scale(0.7)*"EP", CD, dir(CD));
dot(scale(0.7)*"PE", DC, dir(DC));
dot(scale(0.7)*"PP", DD, dir(-DD));

real h = 0.2;
for(int k = 100; k <= 500; k += 100) {
	draw((k/100, h)--(k/100, -h));
	label(scale(0.7)*("$" + string(k) + "$"), (k/100, -2*h));
	draw((h, k/100)--(-h, k/100));
	label(scale(0.7)*("$" + string(k) + "$"), (-3*h, k/100));
}









