"""The "how it works" animation for the demo video (DEMO.md §2), about 52 seconds at 1920x1080.

Four parts, each held for PART_SECONDS so the voiceover fits: the signature, the account, the keys, the name.
The values are real: psycocodes' GitHub ID, his account address and his two keys' hashes.

    manim -qh --media_dir video/media video/how_it_works.py HowItWorks      # 1080p60
    manim -ql --media_dir video/media video/how_it_works.py HowItWorks      # quick preview
"""

from manim import (
    BOLD, DOWN, LEFT, RIGHT, UP, ORIGIN,
    AnimationGroup, Arrow, Circle, Create, FadeIn, FadeOut, GrowArrow, Indicate, Line, MoveAlongPath,
    RoundedRectangle, Scene, Text, Transform, VGroup, Write, config, LaggedStart, ReplacementTransform,
)

config.background_color = "#070a17"

# Design language v2 (web/DESIGN.md)
BLUE = "#2b59ff"
BLUE_TEXT = "#8aa4ff"
LIME = "#c6f432"
INK = "#eef2ff"
MUTED = "#8b93b5"
OK = "#5fe0a3"
ERR = "#ff8b80"
CARD = "#0f1530"
EDGE = "#26305c"
SANS = "Inter"
MONO = "Cascadia Mono"

PART_SECONDS = [14, 14, 15, 9]  # match the voiceover lines in DEMO.md

GITHUB_ID = "172588240"
ACCOUNT = "0x0d39…5809"  # AccountFactory.addressOf(172588240)
KEY_HASHES = ["0x7b5c…ea86", "0x33dd…1fa0"]  # keccak256 of each key blob


def label(s, size=30, color=INK, weight=None, font=SANS):
    return Text(s, font=font, font_size=size, color=color, weight=weight or "NORMAL")


def mono(s, size=26, color=INK):
    return Text(s, font=MONO, font_size=size, color=color)


def card(content, pad=0.35, stroke=EDGE, fill=CARD, radius=0.22):
    box = RoundedRectangle(
        corner_radius=radius, width=content.width + 2 * pad, height=content.height + 2 * pad,
        stroke_color=stroke, stroke_width=2, fill_color=fill, fill_opacity=1,
    ).move_to(content)
    return VGroup(box, content)


def pill(s, color=LIME, text_color="#0a1030", size=22):
    t = label(s, size, text_color, BOLD)
    box = RoundedRectangle(corner_radius=0.2, width=t.width + 0.4, height=t.height + 0.26,
                           stroke_width=0, fill_color=color, fill_opacity=1).move_to(t)
    return VGroup(box, t)


def chip(s, color=BLUE_TEXT, size=22):
    t = label(s, size, color)
    box = RoundedRectangle(corner_radius=0.2, width=t.width + 0.4, height=t.height + 0.26,
                           stroke_color=EDGE, stroke_width=2, fill_color=CARD, fill_opacity=1).move_to(t)
    return VGroup(box, t)


def check(color=OK, scale=1.0):
    return VGroup(
        Line([-0.18, 0, 0], [-0.04, -0.14, 0], color=color, stroke_width=7),
        Line([-0.04, -0.14, 0], [0.22, 0.16, 0], color=color, stroke_width=7),
    ).scale(scale)


def arrow(a, b, color=MUTED, buff=0.2):
    return Arrow(a, b, buff=buff, color=color, stroke_width=4, max_tip_length_to_length_ratio=0.12)


class HowItWorks(Scene):
    def hold(self, start, seconds):
        left = start + seconds - self.renderer.time
        if left > 0.05:
            self.wait(left)

    def construct(self):
        steps = ["1  the signature", "2  the account", "3  the keys", "4  the name"]
        tabs = VGroup(*[label(s, 26, MUTED) for s in steps]).arrange(RIGHT, buff=1.1, aligned_edge=UP).to_edge(UP, buff=0.55)
        underline = Line(LEFT, RIGHT, color=LIME, stroke_width=5)
        self.add(tabs)

        def select(i):
            u = Line(tabs[i].get_corner(DOWN + LEFT) + DOWN * 0.15, tabs[i].get_corner(DOWN + RIGHT) + DOWN * 0.15,
                     color=LIME, stroke_width=5)
            anims = [tabs[j].animate.set_color(LIME if j == i else MUTED) for j in range(4)]
            if i == 0:
                underline.become(u)
                return AnimationGroup(*anims, Create(underline))
            return AnimationGroup(*anims, underline.animate.become(u))

        for i, part in enumerate([self.signature, self.account, self.keys, self.name]):
            start = self.renderer.time
            self.play(select(i), run_time=0.5)
            stage = part()
            self.hold(start, PART_SECONDS[i] - 0.6)
            self.play(FadeOut(stage), run_time=0.6)
        self.play(FadeOut(tabs), FadeOut(underline), run_time=0.5)

    # 1. Any SSH key's signature is checked by the contract itself.
    def signature(self):
        cmd = mono("$ git commit -S", 28, BLUE_TEXT)
        text = VGroup(
            mono("sereno v1", 26, INK),
            mono("chain: 84532", 26, MUTED),
            mono("send: 1 USDC", 26, MUTED),
            mono("to: @psycocodes", 26, MUTED),
            mono("relayer-fee: 0.02", 26, MUTED),
        ).arrange(DOWN, aligned_edge=LEFT, buff=0.16)
        intent = card(text)
        left = VGroup(cmd, intent).arrange(DOWN, aligned_edge=LEFT, buff=0.3).move_to(LEFT * 4.2 + UP * 0.6)
        sig = pill("SSH signature").next_to(intent, DOWN, buff=0.25).align_to(intent, LEFT)

        contract_t = VGroup(label("Sereno account", 34, INK, BOLD),
                            label("checks the SSH signature on-chain", 24, MUTED)).arrange(DOWN, buff=0.18)
        contract = card(contract_t, pad=0.5, stroke=BLUE).move_to(RIGHT * 3.6).set_y(intent.get_y())
        a = arrow(intent.get_right(), contract.get_left())
        tick = check(OK, 1.6).next_to(contract, UP, buff=0.3)
        paid = label("paid", 30, OK, BOLD).next_to(tick, RIGHT, buff=0.2)

        kinds = VGroup(*[chip(s) for s in ["ssh-ed25519", "P-256", "RSA", "security key", "phone + fingerprint"]])
        kinds.arrange(RIGHT, buff=0.3).to_edge(DOWN, buff=1.0)
        kinds_title = label("any key on your GitHub profile", 24, MUTED).next_to(kinds, UP, buff=0.3)

        self.play(FadeIn(cmd, shift=DOWN * 0.2), FadeIn(intent, shift=DOWN * 0.2), run_time=1.2)
        self.play(FadeIn(sig, scale=0.8), run_time=0.6)
        self.play(FadeIn(contract), GrowArrow(a), run_time=1.0)
        travel = VGroup(intent.copy(), sig.copy())
        self.play(travel.animate.scale(0.35).move_to(contract.get_center()).set_opacity(0), run_time=1.2)
        self.play(Create(tick), FadeIn(paid), contract[0].animate.set_stroke(OK), run_time=0.8)
        self.play(FadeIn(kinds_title), LaggedStart(*[FadeIn(k, shift=UP * 0.2) for k in kinds], lag_ratio=0.25),
                  run_time=2.2)
        return VGroup(left, sig, contract, a, tick, paid, kinds, kinds_title)

    # 2. The address comes from the GitHub ID, so it exists for everyone, on every chain.
    def account(self):
        user = label("@psycocodes", 38, INK, BOLD)
        gid = VGroup(label("GitHub ID", 24, MUTED), mono(GITHUB_ID, 32, INK)).arrange(DOWN, buff=0.15)
        gid_note = label("never changes", 22, MUTED)
        addr = VGroup(label("account", 24, MUTED), mono(ACCOUNT, 34, LIME)).arrange(DOWN, buff=0.15)
        row = VGroup(user, gid, addr).arrange(RIGHT, buff=1.2).move_to(UP * 1.0)
        gid_note.next_to(gid, DOWN, buff=0.25)
        a1 = arrow(user.get_right(), gid.get_left())
        a2 = arrow(gid.get_right(), addr.get_left())
        create2 = label("CREATE2", 20, BLUE_TEXT).next_to(a2, UP, buff=0.1)

        chains = VGroup(chip("Base Sepolia"), chip("Arbitrum Sepolia")).arrange(RIGHT, buff=0.5)
        chains.next_to(addr, DOWN, buff=1.4)
        if chains.get_right()[0] > 6.6:
            chains.shift(LEFT * (chains.get_right()[0] - 6.6))
        links = VGroup(*[Line(c.get_top(), addr.get_bottom(), color=EDGE, stroke_width=3) for c in chains])
        same = label("same address on every chain", 24, MUTED).next_to(chains, DOWN, buff=0.3)

        coin = VGroup(Circle(radius=0.32, color=BLUE, fill_color=BLUE, fill_opacity=1), label("$", 30, INK, BOLD))
        coin.move_to(LEFT * 6.4 + DOWN * 2.2)
        early = label("money can arrive before it's deployed", 26, INK).move_to(LEFT * 3.0 + DOWN * 2.2)

        self.play(FadeIn(user, shift=RIGHT * 0.2), run_time=0.8)
        self.play(GrowArrow(a1), FadeIn(gid), run_time=1.0)
        self.play(FadeIn(gid_note), run_time=0.6)
        self.play(GrowArrow(a2), FadeIn(create2), FadeIn(addr), run_time=1.0)
        self.play(LaggedStart(*[FadeIn(c, shift=UP * 0.2) for c in chains], lag_ratio=0.3),
                  LaggedStart(*[Create(l) for l in links], lag_ratio=0.3), FadeIn(same), run_time=1.4)
        self.play(FadeIn(coin), FadeIn(early), run_time=0.8)
        path = Line(coin.get_center(), addr.get_center())
        self.play(MoveAlongPath(coin, path), run_time=1.2)
        self.play(FadeOut(coin, scale=0.3), Indicate(addr[1], color=LIME, scale_factor=1.08), run_time=0.8)
        return VGroup(user, gid, gid_note, addr, a1, a2, create2, chains, links, same, early)

    # 3. Chainlink CRE reads the keys from GitHub, the nodes agree, the oracle stores them; deleting one revokes it.
    def keys(self):
        gh_rows = VGroup(
            mono("ssh-ed25519  AAAAC3Nz…7qBa", 20, INK),
            mono("sk-ecdsa     AAAAInNr…OgQ=", 20, INK),
        ).arrange(DOWN, aligned_edge=LEFT, buff=0.3)
        gh_title = label("github.com/psycocodes.keys", 24, MUTED)
        gh = card(VGroup(gh_title, gh_rows).arrange(DOWN, aligned_edge=LEFT, buff=0.35)).move_to(UP * 0.2)
        gh.to_edge(LEFT, buff=0.5)

        nodes = VGroup(*[VGroup(Circle(radius=0.42, color=BLUE, fill_color=CARD, fill_opacity=1, stroke_width=4),
                                label("node", 20, BLUE_TEXT)) for _ in range(3)])
        nodes.arrange(DOWN, buff=0.45).move_to(RIGHT * 0.3 + UP * 0.2)
        cre = label("Chainlink CRE", 26, BLUE_TEXT, BOLD).next_to(nodes, UP, buff=0.35)

        or_rows = VGroup(*[mono(h, 24, INK) for h in KEY_HASHES]).arrange(DOWN, aligned_edge=LEFT, buff=0.3)
        or_title = label("KeyOracle (on-chain)", 24, MUTED)
        oracle_body = VGroup(or_title, or_rows).arrange(DOWN, aligned_edge=LEFT, buff=0.35)
        oracle = card(oracle_body, stroke=BLUE).move_to(UP * 0.2)
        oracle.to_edge(RIGHT, buff=0.9)
        ticks = VGroup(*[check(OK, 0.8).next_to(r, RIGHT, buff=0.3) for r in or_rows])

        ins = VGroup(*[Line(gh.get_right(), n.get_left(), color=EDGE, stroke_width=3) for n in nodes])
        outs = VGroup(*[Line(n.get_right(), oracle.get_left(), color=EDGE, stroke_width=3) for n in nodes])
        node_ticks = VGroup(*[check(OK, 0.7).move_to(n) for n in nodes])
        agree = label("they agree", 22, OK).next_to(nodes, DOWN, buff=0.3)

        self.play(FadeIn(gh, shift=RIGHT * 0.2), run_time=0.9)
        self.play(FadeIn(cre), LaggedStart(*[FadeIn(n) for n in nodes], lag_ratio=0.2), Create(ins), run_time=1.2)
        self.play(*[FadeOut(n[1]) for n in nodes], LaggedStart(*[Create(t) for t in node_ticks], lag_ratio=0.25),
                  FadeIn(agree), run_time=1.0)
        self.play(Create(outs), FadeIn(oracle), run_time=1.0)
        self.play(LaggedStart(*[Create(t) for t in ticks], lag_ratio=0.3), run_time=0.8)
        self.wait(1.0)

        # Delete the first key on GitHub: the next run drops it on-chain.
        strike = Line(gh_rows[0].get_left(), gh_rows[0].get_right(), color=ERR, stroke_width=5)
        deleted = label("deleted on GitHub", 22, ERR).next_to(gh, DOWN, buff=0.3)
        self.play(Create(strike), gh_rows[0].animate.set_opacity(0.4), FadeIn(deleted), run_time=0.9)
        pulse = VGroup(*[Line(gh.get_right(), n.get_left(), color=BLUE, stroke_width=5) for n in nodes],
                       *[Line(n.get_right(), oracle.get_left(), color=BLUE, stroke_width=5) for n in nodes])
        self.play(Create(pulse), run_time=0.8)
        self.play(FadeOut(pulse), run_time=0.3)
        x = VGroup(Line([-0.15, 0.15, 0], [0.15, -0.15, 0], color=ERR, stroke_width=6),
                   Line([-0.15, -0.15, 0], [0.15, 0.15, 0], color=ERR, stroke_width=6)).move_to(ticks[0])
        revoked = label("revoked", 22, ERR).next_to(oracle, DOWN, buff=0.3)
        self.play(ReplacementTransform(ticks[0], x), or_rows[0].animate.set_color(ERR).set_opacity(0.6),
                  FadeIn(revoked), run_time=0.9)
        return VGroup(gh, strike, deleted, cre, nodes, node_ticks, agree, ins, outs, oracle, ticks[1], x, revoked)

    # 4. The ENS name resolves to the same account.
    def name(self):
        ens = label("psycocodes.sereno.eth", 46, LIME, BOLD)
        steps = VGroup(chip("ENS wildcard resolver", size=26), chip("our gateway: username → GitHub ID → address", size=26))
        addr = VGroup(label("account", 24, MUTED), mono(ACCOUNT, 44, LIME)).arrange(DOWN, buff=0.15)
        VGroup(ens, steps[0], steps[1], addr).arrange(DOWN, buff=0.85).move_to(DOWN * 0.4)
        a1 = arrow(ens.get_bottom(), steps[0].get_top(), buff=0.06)
        a2 = arrow(steps[0].get_bottom(), steps[1].get_top(), buff=0.06)
        a3 = arrow(steps[1].get_bottom(), addr.get_top(), buff=0.06)
        self.play(Write(ens), run_time=1.0)
        self.play(GrowArrow(a1), FadeIn(steps[0]), run_time=0.7)
        self.play(GrowArrow(a2), FadeIn(steps[1]), run_time=0.7)
        self.play(GrowArrow(a3), FadeIn(addr, shift=UP * 0.2), run_time=0.8)
        self.play(Indicate(addr[1], color=LIME, scale_factor=1.08), run_time=0.8)
        return VGroup(ens, steps, addr, a1, a2, a3)
