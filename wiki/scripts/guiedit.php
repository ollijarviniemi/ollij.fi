<?php if (!defined('PmWiki')) exit();
/*  Copyright 2004-2022 Patrick R. Michaud (pmichaud@pobox.com)
    This file is part of PmWiki; you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published
    by the Free Software Foundation; either version 2 of the License, or
    (at your option) any later version.  See pmwiki.php for full details.

    This script adds a graphical button bar to the edit page form.
    The buttons are placed in the $GUIButtons array; each button
    is specified by an array of five values:
      - the position of the button relative to others (a number)
      - the opening markup sequence
      - the closing markup sequence
      - the default text if none was highlighted
      - the text of the button, either (a) HTML markup or (b) the 
        url of a gif/jpg/png image to be used for the button 
        (along with optional "title" text in quotes).

    The buttons specified in this file are the default buttons
    for the standard markups.  Some buttons (e.g., the attach/upload
    button) are specified in their respective cookbook module.
    
    Script maintained by Petko YOTOV www.pmwiki.org/petko
*/


## Included even if no buttons: has "not saved warning" and others
SDVA($HTMLHeaderFmt, array('guiedit' => "<script type='text/javascript'
  src='\$FarmPubDirUrl/guiedit/guiedit.js'></script>\n"));

SDV($GUIButtonDirUrlFmt,'$FarmPubDirUrl/guiedit');

if(IsEnabled($EnableGUIButtons,0)) {
  SDVA($GUIButtons, array(
    'em'       => array(100, "''", "''", '$[Emphasized]',
                    '$GUIButtonDirUrlFmt/em.gif"$[Emphasized (italic)]"',
                    '$[ak_em]'),
    'strong'   => array(110, "'''", "'''", '$[Strong]',
                    '$GUIButtonDirUrlFmt/strong.gif"$[Strong (bold)]"',
                    '$[ak_strong]'),
    'pagelink' => array(200, '[[', ']]', '$[Page link]',
                    '$GUIButtonDirUrlFmt/pagelink.gif"$[Link to internal page]"'),
    'extlink'  => array(210, '[[', ']]', 'https:// | $[link text]',
                    '$GUIButtonDirUrlFmt/extlink.gif"$[Link to external page]"'),
    'big'      => array(300, "'+", "+'", '$[Big text]',
                    '$GUIButtonDirUrlFmt/big.gif"$[Big text]"'),
    'small'    => array(310, "'-", "-'", '$[Small text]',
                    '$GUIButtonDirUrlFmt/small.gif"$[Small text]"'),
    'sup'      => array(320, "'^", "^'", '$[Superscript]',
                    '$GUIButtonDirUrlFmt/sup.gif"$[Superscript]"'),
    'sub'      => array(330, "'_", "_'", '$[Subscript]',
                    '$GUIButtonDirUrlFmt/sub.gif"$[Subscript]"'),
    'h2'       => array(400, '\\n!! ', '\\n', '$[Heading]',
                    '$GUIButtonDirUrlFmt/h.gif"$[Heading]"'),
    'center'   => array(410, '%center%', '', '',
                    '$GUIButtonDirUrlFmt/center.gif"$[Center]"')));

  if(IsEnabled($EnableGuiEditFixUrl)) {
    $GUIButtons['fixurl'] = array($EnableGuiEditFixUrl, 'FixSelectedURL', '', '',
      '$GUIButtonDirUrlFmt/fixurl.png"$[Encode special characters in URL link addresses]"');
  }

  Markup('e_guibuttons', 'directives',
    '/\\(:e_guibuttons:\\)/', 'GUIButtonCode');
}

function GUIButtonCode() {
  global $GUIButtons;
  extract($GLOBALS["MarkupToHTML"]); # get $pagename

  usort($GUIButtons, 'cb_gbcompare');
  
  $json = PHSC(json_encode($GUIButtons));
  $out = "<span class='GUIButtons' data-json=\"$json\"></span>";
  return Keep(FmtPageName($out, $pagename));
}
function cb_gbcompare($a, $b) {return $a[0]-$b[0];}



