// Histoire d'exemple : compile sans erreur, mais contient volontairement
// quelques défauts (coquille, horaire incohérent, répétition, knot orphelin)
// pour que l'analyse IA ait de la matière.
export const SAMPLE_NAME = 'dossier_k7.ink';

export const SAMPLE_SOURCE = `VAR confiance = 3
VAR soupcons = 0
VAR a_le_carnet = false
CONST CODE_STATION = "K-7"

-> quai_de_gare

=== quai_de_gare ===
// Ouverture : gare de province, novembre.
La pluie tombe en biais sur le quai désert. #ambiance:pluie
Un homme en imperméable gris consulte sa montre pour la trosième fois.
* [Lui demander l’heure] -> approche
* [L’ignorer et monter dans le train] -> compartiment
+ {a_le_carnet} [Montrer le carnet] -> carnet_montre

=== approche ===
= premier_contact
« Vous avez l’heure ? » demandez-vous.
Il ne relève pas les yeux. « Toujours trop tard, mademoiselle. »
~ confiance = confiance - 1
{confiance < 3: Il glisse la main dans sa poche, très lentement.}
-> replique

= replique
* « Le train de 23 h 40 est-il à l’heure ? »
    Il sourit enfin. C’était la bonne phrase.
    ~ confiance = confiance + 2
    -> compartiment
* [Insister]
    Il se lève et s’éloigne sans un mot, sans un mot.
    -> le_controleur

=== compartiment ===
Le compartiment sent le tabac froid et la laine mouillée. #lieu:train
{CODE_STATION} est griffonné sur la vitre embuée.
* [Fouiller le filet à bagages] -> fouille
* [Attendre en regardant la vitre] -> le_controleur

= fouille
Sous une valise, un carnet relié de toile noire. Vous le glissez dans votre manche.
~ a_le_carnet = true
~ soupcons = soupcons + 2
-> le_controleur

=== carnet_montre ===
Il feuillette le carnet, puis vous le rend sans un mot.
~ confiance = confiance + 1
-> le_controleur

=== le_controleur ===
La porte coulisse. « Contrôle. Vos papiers, je vous prie. »
Il a des yeux qui ont déjà tout vu, et rien oublié.
~ soupcons = soupcons + 3
* [Tendre vos papiers] -> faux_papiers
+ {a_le_carnet} [Montrer le carnet] -> fin_evasion
* {soupcons < 4} [Retourner fouiller le compartiment] -> compartiment.fouille

= faux_papiers
{confiance >= 4: -> fin_evasion}
-> fin_arrestation

=== fin_arrestation ===
Il replie vos papiers, très lentement. Deux hommes attendent déjà sur le quai suivant.
-> END

=== fin_evasion ===
Il tamponne vos papiers sans un regard. Le train part à minuit moins dix, et vous avec.
-> END

=== archives ===
Les archives de la station K-7 sentent la poussière.
-> END
`;
