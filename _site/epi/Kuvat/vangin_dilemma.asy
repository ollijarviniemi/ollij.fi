include  "/home/olli/olympiad";
include  "/home/olli/cse5";
defaultpen(fontsize (10pt));
usepackage("amsmath");
usepackage("amssymb");
settings.tex="latex";
settings.outformat="pdf";
size (4cm);


real s = 7;

pair O = (0, 0);
pair X1 = (-s, 0);
pair X2 = (s/2, 0);
pair Y1 = (0, -s);
pair Y2 = (0, s/2);
draw(X1 -- X2,arrow=Arrow(TeXHead));
draw(X2 -- X1,arrow=Arrow(TeXHead));
draw(Y1 -- Y2, arrow=Arrow(TeXHead));

label((s/2*0.95, s/12), scale(0.7)*"Hyvä");
label((-s*0.9, s/12), scale(0.7)*"Huono");
label((s/5, s*0.95/2), scale(0.7)*"Hyvä");
label((s/5, -s*0.9), scale(0.7)*"Huono");

pair CC = (-2, -2);
pair CD = (-5, -1);
pair DC = (-1, -5);
pair DD = (-4, -4);

dot(CC);
dot(CD);
dot(DC);
dot(DD);






