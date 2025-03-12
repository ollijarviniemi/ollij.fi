include  "/home/olli/olympiad";
include  "/home/olli/cse5";
defaultpen(fontsize (10pt));
usepackage("amsmath");
usepackage("amssymb");
settings.tex="latex";
settings.outformat="pdf";
size (6cm);



real s = 6;

pair O = (0, 0);
pair X1 = (-1, 0);
pair X2 = (s, 0);
pair Y1 = (0, -1);
pair Y2 = (0, s);
draw(X1 -- X2,arrow=Arrow(TeXHead));
draw(Y1 -- Y2, arrow=Arrow(TeXHead));

label((0.2, s+0.2), scale(0.7)*"ihmisten määrä");
label((-0.55, s*0.7), scale(0.6)*"paljon");
label((-0.55, s*0.2), scale(0.6)*"vähän");
draw((-0.15, s*0.7)--(0.15, s*0.7));
draw((-0.15, s*0.2)--(0.15, s*0.2));

label((s, 0.3), scale(0.7)*"kunto");
label((s*0.25, -0.25), scale(0.6)*"huono");
draw((s*0.25, -0.15)--(s*0.25, 0.15));
draw((s*0.75, 0.15)--(s*0.75, -0.15));
label((s*0.75, -0.25), scale(0.6)*"hyvä");


real f(real x) {
	x = x - 3;
	return 4*exp(-x*x*0.7);
}	

draw(graph(f,0,6));











